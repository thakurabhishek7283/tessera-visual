import { baseStyles, focusRing, TesseraElement, visuallyHidden } from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { TOKEN_COLORS, type ToolId } from '../config.js';
import { INK, resolveColor } from '../engine/color.js';
import type { AnnotatorHandle } from '../types.js';
import { uiStyles } from './ui.js';

const HOTKEYS: Record<ToolId, string> = {
  select: 'V',
  pan: 'H',
  rect: 'R',
  ellipse: 'E',
  polygon: 'P',
  polyline: 'L',
  arrow: 'A',
  freehand: 'D',
  point: 'O',
  text: 'T',
  eraser: 'X',
};

const WIDTHS = [
  { key: 'thin', value: 2 },
  { key: 'medium', value: 4 },
  { key: 'thick', value: 8 },
] as const;

/** Saves a blob under a file name, the way a link click would. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoked later: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * `<tessera-annotator-toolbar>`: tools, undo and redo, zoom, export and (on a board) colour and
 * line width. One tab stop; the arrow keys move between the buttons.
 *
 * @csspart toolbar @csspart button
 * @slot - extra controls at the end
 */
export class TesseraAnnotatorToolbar extends TesseraElement {
  static override properties: PropertyDeclarations = {
    handle: { attribute: false },
    pickers: { type: Boolean },
    menuOpen: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    uiStyles,
    css`
      :host {
        display: block;
      }
      .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-1);
        padding: var(--tessera-space-2);
        background: var(--tessera-color-surface);
        border-bottom: 1px solid var(--tessera-color-border);
      }
      .sep {
        align-self: stretch;
        width: 1px;
        margin: 2px var(--tessera-space-1);
        background: var(--tessera-color-border);
      }
      .swatches {
        display: inline-flex;
        gap: 4px;
      }
      .swatch {
        position: relative;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 2px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-full);
        background: var(--_c);
        cursor: pointer;
      }
      .swatch[aria-checked='true'] {
        border-color: var(--tessera-color-text);
        box-shadow: 0 0 0 2px var(--tessera-color-bg), 0 0 0 4px var(--tessera-color-text);
      }
      .menu {
        position: relative;
      }
      .menu ul {
        position: absolute;
        inset-inline-start: 0;
        top: calc(100% + 4px);
        z-index: var(--tessera-z-popover);
        min-width: 14rem;
        margin: 0;
        padding: var(--tessera-space-1);
        list-style: none;
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        box-shadow: var(--tessera-shadow-md);
      }
      .menu li .btn {
        width: 100%;
        justify-content: flex-start;
      }
      .width {
        min-width: 28px;
        height: 28px;
        padding: 0 6px;
      }
      .width i {
        display: block;
        width: 16px;
        border-radius: 99px;
        background: currentColor;
        height: var(--_h);
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  handle: AnnotatorHandle | undefined;
  /** Show colour and line width pickers (whiteboard). */
  pickers = false;
  menuOpen = false;

  #focusAt(delta: number | 'first' | 'last'): void {
    const buttons = [
      ...this.renderRoot.querySelectorAll<HTMLButtonElement>('[data-roving]:not(:disabled)'),
    ];
    const focused = this.shadowRoot?.activeElement;
    const current = focused ? buttons.indexOf(focused as HTMLButtonElement) : -1;
    const next =
      delta === 'first'
        ? 0
        : delta === 'last'
          ? buttons.length - 1
          : (current + delta + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  #onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.menuOpen) {
      this.menuOpen = false;
      return;
    }
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      event.preventDefault();
      this.#focusAt(step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.#focusAt('first');
    } else if (event.key === 'End') {
      event.preventDefault();
      this.#focusAt('last');
    }
  };

  /** Applies a colour or width to the next shape and, if shapes are selected, to them too. */
  #style(patch: { stroke?: string; strokeWidth?: number }): void {
    const h = this.handle;
    if (!h) return;
    h.drawStyle.set({ ...h.drawStyle.get(), ...patch });
    for (const id of h.selection.get()) {
      const a = h.annotations.get().find((x) => x.id === id);
      if (a && !a.locked) h.update(id, { style: { ...a.style, ...patch } });
    }
  }

  async #export(kind: 'png' | 'json'): Promise<void> {
    const h = this.handle;
    this.menuOpen = false;
    if (!h) return;
    if (kind === 'png') download(await h.exportPNG(), 'annotations.png');
    else {
      const json = JSON.stringify(h.exportW3C(), null, 2);
      download(new Blob([json], { type: 'application/ld+json' }), 'annotations.json');
    }
  }

  protected override render(): unknown {
    const h = this.handle;
    if (!h) return nothing;
    const active = this.observe(h.tool);
    const history = this.observe(h.history.state);
    this.observe(h.view);
    const editable = !h.config.readOnly;
    const tools = h.config.tools.filter((id) => editable || id === 'select' || id === 'pan');
    const style = this.observe(h.drawStyle);
    const focusTool = tools.includes(active) ? active : tools[0];
    const colors = h.mode === 'board' ? [INK, ...TOKEN_COLORS.map((c) => c as string)] : [];
    const currentColor = style.stroke ?? INK;

    return html`<div
      class="bar"
      part="toolbar"
      role="toolbar"
      aria-label=${this.t('annotator.toolbar')}
      @keydown=${this.#onKeydown}
    >
      ${tools.map((id) => {
        const label = this.t(`annotator.tool.${id}`);
        return html`<button
          class="btn"
          part="button"
          type="button"
          data-roving
          data-tool=${id}
          aria-pressed=${active === id ? 'true' : 'false'}
          aria-keyshortcuts=${HOTKEYS[id]}
          title="${label} (${HOTKEYS[id]})"
          tabindex=${id === focusTool ? '0' : '-1'}
          @click=${() => h.setTool(id)}
        >
          <tessera-icon name="tool-${id}" aria-hidden="true"></tessera-icon>
          <span class="visually-hidden">${label}</span>
        </button>`;
      })}
      ${
        this.pickers && editable
          ? html`<span class="sep" role="separator"></span>
              <div class="swatches" role="radiogroup" aria-label=${this.t('annotator.color')}>
                ${colors.map(
                  (c) => html`<button
                    class="swatch"
                    type="button"
                    role="radio"
                    data-roving
                    data-color=${c === INK ? 'ink' : c}
                    aria-checked=${currentColor === c ? 'true' : 'false'}
                    aria-label=${c === INK ? 'ink' : c}
                    tabindex="-1"
                    style="--_c:${c === INK ? INK : resolveColor(c)}"
                    @click=${() => this.#style({ stroke: c })}
                  ></button>`,
                )}
              </div>
              <div role="radiogroup" aria-label=${this.t('annotator.width')} class="swatches">
                ${WIDTHS.map(
                  (w) => html`<button
                    class="btn width"
                    type="button"
                    role="radio"
                    data-roving
                    data-width=${w.key}
                    aria-checked=${style.strokeWidth === w.value ? 'true' : 'false'}
                    aria-label=${this.t(`annotator.width.${w.key}`)}
                    title=${this.t(`annotator.width.${w.key}`)}
                    tabindex="-1"
                    @click=${() => this.#style({ strokeWidth: w.value })}
                  >
                    <i style="--_h:${w.value}px"></i>
                  </button>`,
                )}
              </div>`
          : nothing
      }
      <span class="sep" role="separator"></span>
      ${
        editable
          ? html`<button class="btn" type="button" data-roving tabindex="-1" aria-label=${this.t('annotator.undo')} title="${this.t('annotator.undo')} (Ctrl+Z)" ?disabled=${!history.canUndo} @click=${() => void h.history.undo()}>
                <tessera-icon name="undo" aria-hidden="true"></tessera-icon>
              </button>
              <button class="btn" type="button" data-roving tabindex="-1" aria-label=${this.t('annotator.redo')} title="${this.t('annotator.redo')} (Ctrl+Shift+Z)" ?disabled=${!history.canRedo} @click=${() => void h.history.redo()}>
                <tessera-icon name="redo" aria-hidden="true"></tessera-icon>
              </button>
              <span class="sep" role="separator"></span>`
          : nothing
      }
      <button class="btn" type="button" data-roving tabindex="-1" aria-label=${this.t('annotator.zoom.out')} title="${this.t('annotator.zoom.out')} (−)" @click=${() => h.zoomBy(1 / 1.25)}>
        <tessera-icon name="minus" aria-hidden="true"></tessera-icon>
      </button>
      <button class="btn" type="button" data-roving tabindex="-1" aria-label=${this.t('annotator.zoom.in')} title="${this.t('annotator.zoom.in')} (+)" @click=${() => h.zoomBy(1.25)}>
        <tessera-icon name="plus" aria-hidden="true"></tessera-icon>
      </button>
      <button class="btn" type="button" data-roving tabindex="-1" aria-label=${this.t('annotator.zoom.fit')} title="${this.t('annotator.zoom.fit')} (0)" @click=${() => h.fit()}>
        <tessera-icon name="maximize" aria-hidden="true"></tessera-icon>
      </button>
      <span class="sep" role="separator"></span>
      <div class="menu">
        <button
          class="btn"
          type="button"
          data-roving
          tabindex="-1"
          aria-haspopup="true"
          aria-expanded=${this.menuOpen ? 'true' : 'false'}
          aria-label=${this.t('annotator.export')}
          title=${this.t('annotator.export')}
          @click=${() => {
            this.menuOpen = !this.menuOpen;
          }}
        >
          <tessera-icon name="download" aria-hidden="true"></tessera-icon>
        </button>
        ${
          this.menuOpen
            ? html`<ul>
                <li><button class="btn" type="button" @click=${() => void this.#export('png')}>${this.t('annotator.export.png')}</button></li>
                <li><button class="btn" type="button" @click=${() => void this.#export('json')}>${this.t('annotator.export.json')}</button></li>
              </ul>`
            : nothing
        }
      </div>
      <slot></slot>
    </div>`;
  }
}
