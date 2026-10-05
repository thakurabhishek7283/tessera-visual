import type { TesseraContext } from '@tessera-kit/core';
import { baseStyles, focusRing, TesseraElement, visuallyHidden } from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { describeGeometry } from '../describe.js';
import { resolveColor } from '../engine/color.js';
import { type Annotation, labelOf } from '../geometry/model.js';
import type { AnnotatorHandle } from '../types.js';
import { version } from '../version.js';
import { uiStyles } from './ui.js';

/** Whether the `comments` kit is on and its element is defined, so a discussion can be shown. */
function commentsAvailable(ctx: TesseraContext): boolean {
  const registry = ctx.services as unknown as { get(id: string): unknown };
  return (
    registry.get('comments') !== undefined &&
    typeof customElements !== 'undefined' &&
    !!customElements.get('tessera-comments')
  );
}

/**
 * `<tessera-annotation-list for="id">`: the accessible view of an annotator or whiteboard. Every
 * shape is a button with its label and a sentence describing it; choosing one selects it on the
 * canvas. Below the list, the selected shape can be labelled, noted, hidden, locked, deleted and
 * discussed. Used inside the annotator, or standalone next to it with `for`.
 *
 * @csspart list @csspart item @csspart details
 */
export class TesseraAnnotationList extends TesseraElement {
  static override tesseraVersion: string = version;

  static override properties: PropertyDeclarations = {
    for: { attribute: 'for' },
    handle: { attribute: false },
    linked: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    uiStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
        background: var(--tessera-color-bg);
      }
      h2 {
        margin: 0;
        padding: var(--tessera-space-3) var(--tessera-space-3) var(--tessera-space-1);
        font-size: var(--tessera-font-size-sm);
        font-weight: 700;
      }
      ul {
        flex: 1;
        min-height: 4rem;
        margin: 0;
        padding: var(--tessera-space-1) var(--tessera-space-2);
        list-style: none;
        overflow: auto;
      }
      li {
        display: flex;
        align-items: stretch;
        gap: 2px;
      }
      .row {
        flex: 1;
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        min-width: 0;
        height: auto;
        min-height: 40px;
        padding: var(--tessera-space-1) var(--tessera-space-2);
        justify-content: flex-start;
        text-align: start;
      }
      .text {
        display: grid;
        min-width: 0;
      }
      .name {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .desc {
        font-size: var(--tessera-font-size-xs);
        color: var(--tessera-color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .row[aria-pressed='true'] .desc {
        color: inherit;
      }
      .tag {
        margin-inline-start: auto;
        font-size: var(--tessera-font-size-xs);
      }
      .empty {
        padding: var(--tessera-space-3);
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-sm);
      }
      .details {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--tessera-space-2);
        padding: var(--tessera-space-3);
        border-top: 1px solid var(--tessera-color-border);
        overflow: auto;
        max-height: 55%;
      }
      .details h3 {
        margin: 0;
        font-size: var(--tessera-font-size-sm);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-1);
      }
      .actions .btn {
        height: 32px;
        border-color: var(--tessera-color-border);
      }
    `,
  ];

  protected readonly featureId: string | null = 'annotator';
  /** Id of the annotator or whiteboard element this list belongs to. */
  for: string | undefined;
  /** The annotator to show; set directly when the list is built into the annotator. */
  handle: AnnotatorHandle | undefined;
  /** Bumped when the element named by `for` opens or closes its annotator. */
  linked = 0;

  #onLinkEvent = (): void => {
    this.linked += 1;
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('annotator-ready', this.#onLinkEvent);
    document.addEventListener('annotator-closed', this.#onLinkEvent);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('annotator-ready', this.#onLinkEvent);
    document.removeEventListener('annotator-closed', this.#onLinkEvent);
  }

  get #source(): AnnotatorHandle | undefined {
    if (this.handle) return this.handle;
    if (!this.for) return undefined;
    const root = this.getRootNode() as Document | ShadowRoot;
    const el = root.getElementById?.(this.for) ?? document.getElementById(this.for);
    return (el as (HTMLElement & { handle?: AnnotatorHandle }) | null)?.handle;
  }

  #name(a: Annotation): string {
    return labelOf(a) ?? this.t('list.unlabelled');
  }

  #describe(a: Annotation): string {
    return describeGeometry(a.geometry, (k, p) => this.t(k, p));
  }

  #select(h: AnnotatorHandle, id: string, additive: boolean): void {
    const current = h.selection.get();
    if (additive)
      h.select(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
    else h.select([id]);
  }

  #onRowKeydown(event: KeyboardEvent, h: AnnotatorHandle, id: string): void {
    const rows = [...this.renderRoot.querySelectorAll<HTMLButtonElement>('.row')];
    const at = rows.indexOf(event.currentTarget as HTMLButtonElement);
    const go = (i: number): void => {
      event.preventDefault();
      rows[Math.max(0, Math.min(rows.length - 1, i))]?.focus();
    };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(rows.length - 1);
    else if ((event.key === 'Delete' || event.key === 'Backspace') && !h.config.readOnly) {
      event.preventDefault();
      const selected = h.selection.get();
      const ids = selected.includes(id) ? selected : [id];
      const doomed = new Set(ids);
      const next = rows[at + 1] ?? rows[at - 1];
      h.remove(ids);
      // Keep keyboard focus in the list instead of dropping it on the page.
      void this.updateComplete.then(() => {
        const left = [...this.renderRoot.querySelectorAll<HTMLButtonElement>('.row')];
        (
          left.find((r) => r === next) ?? left.find((r) => !doomed.has(r.dataset.id ?? ''))
        )?.focus();
      });
    }
  }

  #setLabel(h: AnnotatorHandle, a: Annotation, value: string): void {
    const label = value.trim();
    const others = a.bodies.filter((b) => b.purpose !== 'tagging');
    const bodies = label ? [{ purpose: 'tagging' as const, value: label }, ...others] : others;
    const color = h.config.labels.find((l) => l.value === label)?.color;
    h.update(a.id, {
      bodies,
      ...(color && h.mode === 'image' ? { style: { ...a.style, stroke: color } } : {}),
    });
  }

  #setNote(h: AnnotatorHandle, a: Annotation, value: string): void {
    const others = a.bodies.filter((b) => b.purpose !== 'commenting');
    const text = value.trim();
    h.update(a.id, {
      bodies: text ? [...others, { purpose: 'commenting' as const, value: text }] : others,
    });
  }

  #renderDetails(
    h: AnnotatorHandle,
    selected: readonly string[],
    list: readonly Annotation[],
  ): unknown {
    if (selected.length === 0) return nothing;
    const readOnly = h.config.readOnly;
    if (selected.length > 1) {
      return html`<section class="details" part="details" aria-label=${this.t('details.heading')}>
        <h3>${this.t('details.many', { count: selected.length })}</h3>
        ${
          readOnly
            ? nothing
            : html`<div class="actions">
                <button class="btn danger" type="button" @click=${() => h.remove(selected)}>
                  <tessera-icon name="trash" aria-hidden="true"></tessera-icon>${this.t('details.delete')}
                </button>
              </div>`
        }
      </section>`;
    }
    const a = list.find((x) => x.id === selected[0]);
    if (!a) return nothing;
    const label = labelOf(a) ?? '';
    const note = a.bodies.find((b) => b.purpose === 'commenting')?.value ?? '';
    const vocabulary = h.config.labels;
    const free = h.config.allowFreeTextLabels;
    const discuss = h.config.comments && commentsAvailable(this.ctx);
    const locked = readOnly || a.locked === true;
    return html`<section class="details" part="details" aria-label=${this.t('details.heading')}>
      <h3>${this.t('details.heading')}</h3>
      ${
        vocabulary.length > 0 && !free
          ? html`<label>${this.t('details.label')}
              <select ?disabled=${locked} @change=${(e: Event) => this.#setLabel(h, a, (e.target as HTMLSelectElement).value)}>
                <option value="" ?selected=${label === ''}>${this.t('details.label.none')}</option>
                ${vocabulary.map((l) => html`<option value=${l.value} ?selected=${l.value === label}>${l.value}</option>`)}
              </select>
            </label>`
          : html`<label>${this.t('details.label')}
              <input type="text" list="vocabulary" maxlength="60" ?disabled=${locked} .value=${label}
                @change=${(e: Event) => this.#setLabel(h, a, (e.target as HTMLInputElement).value)} />
              <datalist id="vocabulary">${vocabulary.map((l) => html`<option value=${l.value}></option>`)}</datalist>
            </label>`
      }
      ${
        discuss
          ? html`<div>
              <h3>${this.t('details.discussion')}</h3>
              <tessera-comments target="annotation:${h.setId}:${a.id}" ?readonly=${readOnly}></tessera-comments>
            </div>`
          : html`<label>${this.t('details.note')}
              <textarea rows="3" maxlength="2000" ?disabled=${locked} .value=${note}
                @change=${(e: Event) => this.#setNote(h, a, (e.target as HTMLTextAreaElement).value)}></textarea>
            </label>`
      }
      <div class="actions">
        <button class="btn" type="button" @click=${() => h.zoomTo(a.id)}>
          <tessera-icon name="search" aria-hidden="true"></tessera-icon>${this.t('details.zoom')}
        </button>
        ${
          readOnly
            ? nothing
            : html`<button class="btn" type="button" aria-pressed=${a.hidden ? 'true' : 'false'} @click=${() => h.setVisible(a.id, a.hidden === true)}>
                  <tessera-icon name=${a.hidden ? 'eye' : 'eye-off'} aria-hidden="true"></tessera-icon>${a.hidden ? this.t('details.show') : this.t('details.hide')}
                </button>
                <button class="btn" type="button" aria-pressed=${a.locked ? 'true' : 'false'} @click=${() => h.update(a.id, { locked: !a.locked })}>
                  <tessera-icon name=${a.locked ? 'unlock' : 'lock'} aria-hidden="true"></tessera-icon>${a.locked ? this.t('details.unlock') : this.t('details.lock')}
                </button>
                <button class="btn danger" type="button" ?disabled=${a.locked === true} @click=${() => h.remove([a.id])}>
                  <tessera-icon name="trash" aria-hidden="true"></tessera-icon>${this.t('details.delete')}
                </button>`
        }
      </div>
    </section>`;
  }

  protected override renderFeature(): unknown {
    void this.linked;
    const h = this.#source;
    if (!h) return nothing;
    const list = this.observe(h.annotations);
    const selected = this.observe(h.selection);
    const chosen = new Set(selected);
    // The topmost shape first, like layers in a drawing program.
    const rows = [...list].reverse();
    return html`
      <h2 id="heading">${this.t('list.label')}</h2>
      <p class="visually-hidden" role="status">${this.t('list.count', { count: list.length })}</p>
      ${
        rows.length === 0
          ? html`<p class="empty">${this.t('list.empty')}</p>`
          : html`<ul part="list" aria-labelledby="heading">
              ${repeat(
                rows,
                (a) => a.id,
                (a) => {
                  const name = this.#name(a);
                  const stroke = resolveColor(a.style?.stroke);
                  return html`<li part="item">
                    <button
                      class="btn row"
                      type="button"
                      data-id=${a.id}
                      aria-pressed=${chosen.has(a.id) ? 'true' : 'false'}
                      @click=${(e: MouseEvent) => this.#select(h, a.id, e.shiftKey || e.ctrlKey || e.metaKey)}
                      @keydown=${(e: KeyboardEvent) => this.#onRowKeydown(e, h, a.id)}
                    >
                      <span class="dot" style="--_c:${stroke}" aria-hidden="true"></span>
                      <span class="text">
                        <span class="name">${name}</span>
                        <span class="desc">${this.#describe(a)}</span>
                      </span>
                      ${a.locked ? html`<span class="tag"><tessera-icon name="lock" size="14" label=${this.t('list.locked')}></tessera-icon></span>` : nothing}
                    </button>
                    ${
                      h.config.readOnly
                        ? nothing
                        : html`<button
                            class="btn"
                            type="button"
                            aria-pressed=${a.hidden ? 'true' : 'false'}
                            aria-label=${a.hidden ? this.t('list.show', { name }) : this.t('list.hide', { name })}
                            @click=${() => h.setVisible(a.id, a.hidden === true)}
                          >
                            <tessera-icon name=${a.hidden ? 'eye-off' : 'eye'} aria-hidden="true"></tessera-icon>
                          </button>`
                    }
                  </li>`;
                },
              )}
            </ul>`
      }
      ${this.#renderDetails(h, selected, list)}
    `;
  }
}
