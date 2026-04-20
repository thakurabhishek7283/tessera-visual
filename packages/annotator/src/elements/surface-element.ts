import type { Unsubscribe } from '@tessera/core';
import { baseStyles, focusRing, TesseraElement, visuallyHidden } from '@tessera/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import type { AnnotatorConfigValue } from '../config.js';
import { describeGeometry } from '../describe.js';
import { resolveColor } from '../engine/color.js';
import { bboxOf } from '../geometry/bbox.js';
import { type Annotation, labelOf } from '../geometry/model.js';
import type { AnnotatorApi, AnnotatorHandle } from '../types.js';
import './label-picker.js';
import './toolbar.js';
import './annotation-list.js';
import './minimap.js';
import type { LabelChoice } from './label-picker.js';

interface TextEdit {
  x: number;
  y: number;
  fontSize: number;
  text: string;
  resolve(text: string | null): void;
}

interface LabelAsk {
  x: number;
  y: number;
  resolve(label: string | null): void;
}

/**
 * Shared behaviour of `<tessera-annotator>` and `<tessera-whiteboard>`: it opens an annotator
 * surface inside its canvas through the `annotator` service, wires the prompts a person has to
 * answer (label, text) and turns what happens into DOM events.
 *
 * @fires annotation-create - `{ annotation }`, cancelable: call `preventDefault()` to discard the shape
 * @fires annotation-update - `{ annotation, before }` after a shape changed
 * @fires annotation-delete - `{ annotation }` after a shape was removed
 * @fires selection-change - `{ ids }`
 * @fires annotator-ready - `{ handle }` once the surface is open
 * @fires annotator-closed - when the surface was closed
 * @csspart toolbar @csspart canvas @csspart panel
 */
export abstract class TesseraSurfaceElement extends TesseraElement {
  static override properties: PropertyDeclarations = {
    readonly: { type: Boolean, reflect: true },
    noPanel: { type: Boolean, attribute: 'no-panel' },
    alt: {},
    config: { attribute: false },
    handle: { state: true },
    failure: { state: true },
    loading: { state: true },
    labelAsk: { state: true },
    textEdit: { state: true },
    announcement: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    css`
      :host {
        display: block;
        height: var(--tessera-annotator-height, 34rem);
        min-height: 16rem;
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-lg);
        overflow: hidden;
        background: var(--tessera-color-bg);
      }
      .root {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .body {
        flex: 1;
        display: grid;
        grid-template-columns: minmax(0, 1fr) var(--tessera-annotator-panel-width, 19rem);
        min-height: 0;
      }
      :host([no-panel]) .body {
        grid-template-columns: minmax(0, 1fr);
      }
      @media (max-width: 52rem) {
        .body {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: minmax(12rem, 1fr) minmax(8rem, 40%);
        }
      }
      .stage {
        position: relative;
        min-width: 0;
        min-height: 0;
        background: var(--tessera-color-surface-2);
      }
      .stage[data-mode='board'] {
        background: var(--tessera-color-bg);
      }
      .canvas {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      .canvas:focus-visible {
        outline-offset: -3px;
      }
      tessera-annotation-list {
        border-inline-start: 1px solid var(--tessera-color-border);
        min-height: 0;
      }
      @media (max-width: 52rem) {
        tessera-annotation-list {
          border-inline-start: 0;
          border-top: 1px solid var(--tessera-color-border);
        }
      }
      .message {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: var(--tessera-space-4);
        text-align: center;
        pointer-events: none;
      }
      .message.error {
        color: var(--tessera-color-danger);
      }
      .minimap {
        position: absolute;
        inset-inline-start: var(--tessera-space-3);
        inset-block-end: var(--tessera-space-3);
        z-index: 2;
      }
      .text-editor {
        position: absolute;
        z-index: var(--tessera-z-popover);
        min-width: 8ch;
        margin: 0;
        padding: 0 2px;
        font-family: var(--tessera-font-family);
        line-height: 1.25;
        color: var(--_c);
        background: color-mix(in srgb, var(--tessera-color-bg) 85%, transparent);
        border: 1px dashed var(--tessera-color-primary);
        outline: none;
        resize: both;
        overflow: hidden;
      }
    `,
  ];

  protected readonly featureId: string | null = 'annotator';
  protected abstract readonly mode: 'image' | 'board';
  /** What to open: the image URL (image mode). */
  protected abstract get source(): string | undefined;
  /** Key of the stored set. */
  protected abstract get setKey(): string | undefined;

  readonly = false;
  noPanel = false;
  alt: string | undefined;
  /** Options for this surface on top of the feature's configuration, e.g. `{ tools, labels }`. */
  config: Partial<Omit<AnnotatorConfigValue, 'enabled'>> | undefined;
  handle: AnnotatorHandle | undefined;
  failure: string | undefined;
  loading = false;
  labelAsk: LabelAsk | undefined;
  textEdit: TextEdit | undefined;
  announcement = '';

  #key: string | undefined;
  #opening: string | undefined;
  #failed: string | undefined;
  #generation = 0;
  #offs: Unsubscribe[] = [];
  #canvasBox = { w: 0, h: 0 };
  #resize: ResizeObserver | undefined;

  protected get canvas(): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>('.canvas');
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize?.disconnect();
    this.#close();
  }

  protected override updated(): void {
    this.#sync();
    const canvas = this.canvas;
    if (canvas && !this.#resize) {
      this.#resize = new ResizeObserver(() => {
        const box = canvas.getBoundingClientRect();
        this.#canvasBox = { w: box.width, h: box.height };
        if (this.labelAsk) this.requestUpdate();
      });
      this.#resize.observe(canvas);
    }
  }

  #wanted(): string | undefined {
    if (this.mode === 'image' && !this.source) return undefined;
    return JSON.stringify([this.mode, this.source, this.setKey, this.readonly, this.config]);
  }

  #sync(): void {
    const canvas = this.canvas;
    const api = this.enabled
      ? (this.ctx.services.get('annotator') as AnnotatorApi | undefined)
      : undefined;
    const wanted = api && canvas ? this.#wanted() : undefined;
    if (!api || !canvas || wanted === undefined) {
      this.#close();
      return;
    }
    if (wanted === this.#key || wanted === this.#opening || wanted === this.#failed) return;
    this.#close();
    void this.#open(api, canvas, wanted);
  }

  async #open(api: AnnotatorApi, canvas: HTMLElement, key: string): Promise<void> {
    const generation = ++this.#generation;
    this.#opening = key;
    this.failure = undefined;
    this.loading = true;
    let handle: AnnotatorHandle | undefined;
    try {
      handle = await api.create(canvas, {
        mode: this.mode,
        ...(this.source ? { src: this.source } : {}),
        ...(this.setKey ? { setId: this.setKey } : {}),
        alt: this.alt ?? this.t(this.mode === 'image' ? 'annotator.canvas' : 'annotator.board'),
        config: { ...this.config, ...(this.readonly ? { readOnly: true } : {}) },
        hooks: {
          beforeCreate: (draft) =>
            this.emit('annotation-create', { annotation: draft }, { cancelable: true }),
          pickLabel: (draft) => this.#askLabel(draft),
          editText: (request) => this.#editText(request),
        },
      });
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#failed = key;
      this.failure = error instanceof Error ? error.message : String(error);
      this.loading = false;
      this.#opening = undefined;
      return;
    }
    if (generation !== this.#generation) {
      void handle.destroy();
      return;
    }
    this.#key = key;
    this.#opening = undefined;
    this.loading = false;
    this.handle = handle;
    this.#watch(handle);
    this.emit('annotator-ready', { handle });
  }

  #describe(a: Annotation): string {
    const name = labelOf(a);
    const shape = describeGeometry(a.geometry, (k, p) => this.t(k, p));
    return name ? `${name}, ${shape}` : shape;
  }

  #watch(handle: AnnotatorHandle): void {
    let selected = handle.selection.get();
    this.#offs.push(
      handle.selection.subscribe((ids) => {
        if (ids.length === selected.length && ids.every((id, i) => id === selected[i])) return;
        selected = ids;
        this.emit('selection-change', { ids: [...ids] });
        const id = ids.at(-1);
        const a = id ? handle.annotations.get().find((x) => x.id === id) : undefined;
        if (a)
          this.announcement = this.t('annotator.announce.selected', {
            description: this.#describe(a),
          });
      }),
      handle.on('change', (changes) => {
        for (const { before, after } of changes.updated) {
          this.emit('annotation-update', { annotation: after, before });
        }
        for (const annotation of changes.deleted) {
          this.emit('annotation-delete', { annotation });
        }
        const created = changes.created.at(-1);
        const deleted = changes.deleted.at(-1);
        if (created) {
          this.announcement = this.t('annotator.announce.created', {
            description: this.#describe(created),
          });
        } else if (deleted) {
          this.announcement = this.t('annotator.announce.deleted', {
            description: this.#describe(deleted),
          });
        }
      }),
    );
  }

  #close(): void {
    this.#generation++;
    this.#key = undefined;
    this.#opening = undefined;
    this.#failed = undefined;
    for (const off of this.#offs.splice(0)) off();
    this.labelAsk?.resolve(null);
    this.labelAsk = undefined;
    this.textEdit?.resolve(null);
    this.textEdit = undefined;
    const handle = this.handle;
    if (!handle) return;
    this.handle = undefined;
    void handle.destroy();
    this.emit('annotator-closed', {});
  }

  /** Screen position, inside the canvas, of a world point. */
  #toScreen(x: number, y: number): [number, number] {
    const view = this.handle?.view.get() ?? { scale: 1, tx: 0, ty: 0 };
    return [x * view.scale + view.tx, y * view.scale + view.ty];
  }

  #askLabel(draft: Annotation): Promise<string | null> {
    this.labelAsk?.resolve(null);
    const box = bboxOf(draft.geometry);
    const [x, y] = this.#toScreen(box.x + box.w / 2, box.y + box.h / 2);
    return new Promise((resolve) => {
      this.labelAsk = {
        x,
        y,
        resolve: (label) => {
          this.labelAsk = undefined;
          resolve(label);
          this.canvas?.focus({ preventScroll: true });
        },
      };
    });
  }

  #editText(request: {
    x: number;
    y: number;
    fontSize: number;
    text: string;
  }): Promise<string | null> {
    this.textEdit?.resolve(null);
    const [x, y] = this.#toScreen(request.x, request.y);
    return new Promise((resolve) => {
      this.textEdit = {
        ...request,
        x,
        y,
        resolve: (text) => {
          this.textEdit = undefined;
          resolve(text);
          this.canvas?.focus({ preventScroll: true });
        },
      };
    });
  }

  #textEditor(edit: TextEdit): unknown {
    const handle = this.handle;
    const scale = handle?.view.get().scale ?? 1;
    const stroke = resolveColor(handle?.drawStyle.get().stroke);
    let done = false;
    const finish = (text: string | null): void => {
      if (done) return;
      done = true;
      edit.resolve(text);
    };
    return html`<textarea
      class="text-editor"
      aria-label=${this.t('annotator.text.label')}
      rows="1"
      style="left:${edit.x}px;top:${edit.y}px;font-size:${Math.max(10, edit.fontSize * scale)}px;--_c:${stroke}"
      .value=${edit.text}
      @keydown=${(e: KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish((e.target as HTMLTextAreaElement).value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      }}
      @blur=${(e: FocusEvent) => finish((e.target as HTMLTextAreaElement).value)}
    ></textarea>`;
  }

  protected override renderFeature(): unknown {
    const handle = this.handle;
    const labels: LabelChoice[] = handle?.config.labels ?? [];
    return html`<div class="root">
      <tessera-annotator-toolbar
        part="toolbar"
        .handle=${handle}
        ?pickers=${this.mode === 'board'}
      ></tessera-annotator-toolbar>
      <div class="body">
        <div class="stage" data-mode=${this.mode}>
          <div
            class="canvas"
            part="canvas"
            role="group"
            tabindex="0"
            aria-label=${this.alt ?? this.t(this.mode === 'image' ? 'annotator.canvas' : 'annotator.board')}
            aria-describedby="help"
          ></div>
          <p id="help" class="visually-hidden">${this.t('annotator.canvas.help')}</p>
          <div class="visually-hidden" role="status" aria-live="polite">${this.announcement}</div>
          ${
            this.loading
              ? html`<div class="message"><tessera-spinner label=${this.t('annotator.loading')}></tessera-spinner></div>`
              : nothing
          }
          ${
            this.failure ? html`<p class="message error" role="alert">${this.failure}</p>` : nothing
          }
          ${
            this.labelAsk
              ? html`<tessera-label-picker
                  .labels=${labels}
                  .x=${this.labelAsk.x}
                  .y=${this.labelAsk.y}
                  .bounds=${this.#canvasBox}
                  ?allow-free=${handle?.config.allowFreeTextLabels ?? true}
                  @label-pick=${(e: CustomEvent<{ value: string }>) => this.labelAsk?.resolve(e.detail.value)}
                  @label-cancel=${() => this.labelAsk?.resolve(null)}
                ></tessera-label-picker>`
              : nothing
          }
          ${
            handle?.config.minimap
              ? html`<tessera-annotator-minimap class="minimap" .handle=${handle} .image=${this.source}></tessera-annotator-minimap>`
              : nothing
          }
          ${this.textEdit ? this.#textEditor(this.textEdit) : nothing}
        </div>
        ${
          this.noPanel
            ? nothing
            : html`<tessera-annotation-list part="panel" .handle=${handle}></tessera-annotation-list>`
        }
      </div>
    </div>`;
  }
}
