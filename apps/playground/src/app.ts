import type { TesseraInstance, ThemeMode } from '@tessera/core';
import { baseStyles, focusRing, toastErrors } from '@tessera/elements';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';
import './config-form.js';
import { createInstance } from './instance.js';
import { SECTIONS } from './sections.js';
import { anotherUser, USERS } from './users.js';

const params = new URLSearchParams(location.search);
const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  const v = params.get(key);
  return allowed.includes(v as T) ? (v as T) : fallback;
};

/** The playground: every kit of this repo with its options editable live. */
export class PlaygroundApp extends LitElement {
  static override properties: PropertyDeclarations = {
    tab: { state: true },
    user: { state: true },
    theme: { state: true },
    locale: { state: true },
    instance: { state: true },
    ready: { state: true },
    failure: { state: true },
    enabled: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: block;
        min-height: 100vh;
        background: var(--tessera-color-bg);
        color: var(--tessera-color-text);
      }
      header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-3);
        padding: var(--tessera-space-3) var(--tessera-space-4);
        border-bottom: 1px solid var(--tessera-color-border);
      }
      h1 {
        margin: 0;
        font-size: var(--tessera-font-size-lg);
      }
      h1 small {
        display: block;
        font-size: var(--tessera-font-size-xs);
        font-weight: 400;
        color: var(--tessera-color-text-muted);
      }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-1);
        flex: 1;
      }
      .controls {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-2);
        align-items: center;
      }
      label {
        font-size: var(--tessera-font-size-sm);
      }
      select {
        min-height: 32px;
        font: inherit;
        font-size: var(--tessera-font-size-sm);
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        padding: 0 var(--tessera-space-2);
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
      }
      @media (min-width: 62rem) {
        .layout {
          grid-template-columns: 18rem minmax(0, 1fr);
        }
      }
      aside {
        padding: var(--tessera-space-3);
        border-inline-end: 1px solid var(--tessera-color-border);
        background: var(--tessera-color-surface);
        max-height: calc(100vh - 4.5rem);
        overflow: auto;
      }
      aside details {
        margin-bottom: var(--tessera-space-3);
      }
      aside summary {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        cursor: pointer;
        font-weight: 700;
        padding: var(--tessera-space-1) 0;
      }
      main {
        padding: var(--tessera-space-4);
        min-width: 0;
      }
      h2 {
        margin: 0 0 var(--tessera-space-2);
        font-size: var(--tessera-font-size-lg);
      }
      .note {
        margin: 0 0 var(--tessera-space-3);
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-sm);
      }
      .failure {
        padding: var(--tessera-space-3);
        border: 1px solid var(--tessera-color-danger);
        border-radius: var(--tessera-radius-md);
        color: var(--tessera-color-danger);
      }
    `,
  ];

  tab: string = params.get('tab') ?? SECTIONS[0]?.id ?? '';
  user: string = read('user', Object.keys(USERS), 'alice');
  theme: ThemeMode = read('theme', ['auto', 'light', 'dark'] as const, 'auto');
  locale: string = read('locale', ['en', 'de'] as const, 'en');
  instance: TesseraInstance | undefined;
  ready = false;
  failure: string | undefined;
  enabled: Record<string, boolean> = {};

  #configs: Record<string, Record<string, unknown>> = {};
  #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #stopErrors: (() => void) | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.#create();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#stopErrors?.();
    void this.instance?.destroy();
  }

  async #create(): Promise<void> {
    this.ready = false;
    this.failure = undefined;
    this.#stopErrors?.();
    const previous = this.instance;
    this.instance = undefined;
    await previous?.destroy();
    try {
      const instance = await createInstance({
        user: this.user,
        theme: this.theme,
        locale: this.locale,
        enabled: this.enabled,
        configs: this.#configs,
      });
      this.#stopErrors = toastErrors(instance);
      this.instance = instance;
      await instance.ready;
      this.ready = true;
    } catch (error) {
      this.failure = error instanceof Error ? error.message : String(error);
    }
  }

  #sync(): void {
    const next = new URLSearchParams();
    if (this.tab) next.set('tab', this.tab);
    next.set('user', this.user);
    if (this.theme !== 'auto') next.set('theme', this.theme);
    if (this.locale !== 'en') next.set('locale', this.locale);
    history.replaceState(null, '', `${location.pathname}?${next}`);
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (['tab', 'user', 'theme', 'locale'].some((k) => changed.has(k))) {
      this.#sync();
    }
  }

  #changeFeature(id: string, patch: Record<string, unknown>): void {
    this.#configs[id] = patch;
    clearTimeout(this.#timers.get(id));
    this.#timers.set(
      id,
      setTimeout(async () => {
        const instance = this.instance;
        if (!instance || this.enabled[id] === false) return;
        // Re-running setup is how a feature picks up new options.
        await instance.disable(id);
        await instance.enable(id, patch).catch(() => undefined);
      }, 250),
    );
  }

  async #toggleFeature(id: string, on: boolean): Promise<void> {
    this.enabled = { ...this.enabled, [id]: on };
    if (on) await this.instance?.enable(id, this.#configs[id]).catch(() => undefined);
    else await this.instance?.disable(id);
  }

  #openAnotherTab = (): void => {
    const next = new URL(location.href);
    next.searchParams.set('user', anotherUser(this.user));
    window.open(next, '_blank', 'noopener');
  };

  #renderPanel(): unknown {
    return html`<aside aria-label="Configuration">
      ${SECTIONS.map(
        (s) => html`<details ?open=${s.id === this.tab}>
          <summary>
            <input type="checkbox" aria-label=${`Enable ${s.label}`} .checked=${this.enabled[s.id] ?? true} @click=${(e: Event) => e.stopPropagation()} @change=${(e: Event) => void this.#toggleFeature(s.id, (e.target as HTMLInputElement).checked)} />
            ${s.label}
          </summary>
          <config-form .schema=${s.schema} .value=${{ ...s.defaults, ...this.#configs[s.id] }} @config-change=${(e: CustomEvent<{ value: Record<string, unknown> }>) => this.#changeFeature(s.id, e.detail.value)}></config-form>
        </details>`,
      )}
    </aside>`;
  }

  #renderMain(): unknown {
    const section = SECTIONS.find((s) => s.id === this.tab) ?? SECTIONS[0];
    if (!this.instance || !section) return nothing;
    return html`<section aria-labelledby="section-title">
      <h2 id="section-title">${section.label}</h2>
      <p class="note">${section.blurb}</p>
      ${section.render({ instance: this.instance, user: this.user })}
    </section>`;
  }

  protected override render(): unknown {
    return html`<tessera-root .tessera=${this.instance}>
      <header>
        <h1>Tessera visual<small>annotator · whiteboard · maps</small></h1>
        <nav aria-label="Kits">
          ${SECTIONS.map(
            (s) =>
              html`<tessera-button size="sm" variant=${s.id === this.tab ? 'primary' : 'ghost'} @click=${() => (this.tab = s.id)}>${s.label}</tessera-button>`,
          )}
        </nav>
        <div class="controls">
          <label>User
            <select @change=${(e: Event) => {
              this.user = (e.target as HTMLSelectElement).value;
              void this.#create();
            }}>
              ${Object.entries(USERS).map(([id, u]) => html`<option value=${id} ?selected=${id === this.user}>${u.name}</option>`)}
            </select>
          </label>
          <label>Theme
            <select @change=${(e: Event) => {
              this.theme = (e.target as HTMLSelectElement).value as ThemeMode;
              this.instance?.setTheme(this.theme);
            }}>
              ${(['auto', 'light', 'dark'] as const).map((s) => html`<option value=${s} ?selected=${s === this.theme}>${s}</option>`)}
            </select>
          </label>
          <label>Language
            <select @change=${(e: Event) => {
              this.locale = (e.target as HTMLSelectElement).value;
              this.instance?.setLocale(this.locale);
            }}>
              <option value="en" ?selected=${this.locale === 'en'}>English</option>
              <option value="de" ?selected=${this.locale === 'de'}>Deutsch</option>
            </select>
          </label>
          <tessera-button size="sm" variant="ghost" @click=${this.#openAnotherTab}>Open another tab as ${USERS[anotherUser(this.user)]?.name.split(' ')[0] ?? 'Bob'}</tessera-button>
        </div>
      </header>
      ${
        this.failure
          ? html`<main><p class="failure" role="alert">Could not start: ${this.failure}</p></main>`
          : this.ready
            ? html`<div class="layout">${this.#renderPanel()}<main>${this.#renderMain()}</main></div>`
            : html`<main><tessera-spinner label="Loading"></tessera-spinner></main>`
      }
    </tessera-root>`;
  }
}

if (!customElements.get('playground-app')) customElements.define('playground-app', PlaygroundApp);
