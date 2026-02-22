import { baseStyles, focusRing, TesseraElement } from '@tessera/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { resolveColor } from '../engine/color.js';
import { uiStyles } from './ui.js';

export interface LabelChoice {
  value: string;
  color: string;
}

/**
 * `<tessera-label-picker>`: a small dialog next to a freshly drawn shape that asks for its label:
 * the vocabulary as buttons, and a text field when free-text labels are allowed. Escape or the
 * cancel button discards.
 *
 * @fires label-pick - `{ value }`
 * @fires label-cancel - nothing
 * @csspart picker @csspart option
 */
export class TesseraLabelPicker extends TesseraElement {
  static override properties: PropertyDeclarations = {
    labels: { attribute: false },
    allowFree: { type: Boolean, attribute: 'allow-free' },
    x: { type: Number },
    y: { type: Number },
    bounds: { attribute: false },
    draft: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    uiStyles,
    css`
      :host {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: var(--tessera-z-popover);
      }
      .picker {
        position: absolute;
        pointer-events: auto;
        display: grid;
        gap: var(--tessera-space-2);
        width: 14rem;
        max-width: calc(100% - 16px);
        padding: var(--tessera-space-3);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-lg);
        box-shadow: var(--tessera-shadow-md);
      }
      h2 {
        margin: 0;
        font-size: var(--tessera-font-size-sm);
      }
      ul {
        display: grid;
        gap: 2px;
        margin: 0;
        padding: 0;
        list-style: none;
        max-height: 12rem;
        overflow: auto;
      }
      .option {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        width: 100%;
        height: auto;
        min-height: 32px;
        justify-content: flex-start;
        text-align: start;
      }
      form {
        display: flex;
        gap: var(--tessera-space-1);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  labels: LabelChoice[] = [];
  allowFree = true;
  /** Position of the anchor inside the surrounding box, in pixels. */
  x = 0;
  y = 0;
  /** Size of the surrounding box, to keep the dialog inside it. */
  bounds: { w: number; h: number } = { w: 0, h: 0 };
  draft = '';

  protected override firstUpdated(): void {
    queueMicrotask(() => this.renderRoot.querySelector<HTMLElement>('.option, input')?.focus());
  }

  #pick(value: string): void {
    const label = value.trim();
    if (label) this.emit('label-pick', { value: label });
  }

  #cancel(): void {
    this.emit('label-cancel', {});
  }

  #onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.#cancel();
    }
  };

  protected override render(): unknown {
    const width = 14 * 16;
    const left = Math.max(
      8,
      Math.min(this.x + 12, (this.bounds.w || this.x + width + 24) - width - 8),
    );
    const top = Math.max(8, Math.min(this.y + 12, (this.bounds.h || this.y + 300) - 220));
    return html`<div
      class="picker"
      part="picker"
      role="dialog"
      aria-labelledby="title"
      style="left:${left}px;top:${top}px"
      @keydown=${this.#onKeydown}
    >
      <h2 id="title">${this.t('label.title')}</h2>
      ${
        this.labels.length > 0
          ? html`<ul>
              ${this.labels.map(
                (l) => html`<li>
                  <button
                    class="btn option"
                    part="option"
                    type="button"
                    style="--_c:${resolveColor(l.color)}"
                    @click=${() => this.#pick(l.value)}
                  >
                    <span class="dot" aria-hidden="true"></span>${l.value}
                  </button>
                </li>`,
              )}
            </ul>`
          : nothing
      }
      ${
        this.allowFree
          ? html`<form
              @submit=${(e: Event) => {
                e.preventDefault();
                this.#pick(this.draft);
              }}
            >
              <input
                type="text"
                aria-label=${this.t('label.custom')}
                placeholder=${this.t('label.custom')}
                maxlength="60"
                .value=${this.draft}
                @input=${(e: Event) => {
                  this.draft = (e.target as HTMLInputElement).value;
                }}
              />
              <button class="btn solid" type="submit" ?disabled=${this.draft.trim() === ''}>
                ${this.t('label.add')}
              </button>
            </form>`
          : nothing
      }
      <div class="actions">
        <button class="btn" type="button" @click=${() => this.#cancel()}>${this.t('label.cancel')}</button>
      </div>
    </div>`;
  }
}
