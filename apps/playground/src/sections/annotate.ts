import '@tessera-kit/annotator/elements';
import type { AnnotatorHandle, W3CAnnotation } from '@tessera-kit/annotator';
import { AnnotatorConfig } from '@tessera-kit/annotator';
import { baseStyles, focusRing } from '@tessera-kit/elements';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';
import type { Section } from '../sections.js';

const base = import.meta.env.BASE_URL;
const IMAGES = [
  { id: 'camp-map', label: 'Campsite map', src: `${base}samples/camp-map.svg` },
  { id: 'floor-plan', label: 'Shop floor plan', src: `${base}samples/floor-plan.svg` },
  { id: 'gear-shelf', label: 'Gear shelf', src: `${base}samples/gear-shelf.svg` },
] as const;

/** The annotator with a picture to choose and the W3C JSON of what has been drawn. */
export class AnnotateDemo extends LitElement {
  static override properties: PropertyDeclarations = {
    image: { state: true },
    json: { state: true },
    handle: { state: true },
    importText: { state: true },
    warnings: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: grid;
        gap: var(--tessera-space-3);
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-3);
        align-items: end;
      }
      label {
        display: grid;
        gap: 2px;
        font-size: var(--tessera-font-size-sm);
      }
      select,
      textarea {
        font: inherit;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        padding: var(--tessera-space-1) var(--tessera-space-2);
      }
      select {
        min-height: 32px;
      }
      tessera-annotator {
        --tessera-annotator-height: 36rem;
      }
      details {
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        padding: var(--tessera-space-2) var(--tessera-space-3);
      }
      summary {
        cursor: pointer;
        font-weight: 600;
      }
      pre {
        max-height: 18rem;
        overflow: auto;
        margin: var(--tessera-space-2) 0 0;
        font-size: var(--tessera-font-size-xs);
        background: var(--tessera-color-surface);
        padding: var(--tessera-space-2);
        border-radius: var(--tessera-radius-sm);
      }
      textarea {
        width: 100%;
        min-height: 6rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: var(--tessera-font-size-xs);
      }
      .warn {
        color: var(--tessera-color-warning);
        font-size: var(--tessera-font-size-sm);
      }
    `,
  ];

  image: string = new URLSearchParams(location.search).get('image') ?? IMAGES[0].id;
  json = '[]';
  handle: AnnotatorHandle | undefined;
  importText = '';
  warnings: string[] = [];
  #off: (() => void) | undefined;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#off?.();
  }

  #onReady = (e: Event): void => {
    const handle = (e as CustomEvent<{ handle: AnnotatorHandle }>).detail.handle;
    this.#off?.();
    this.handle = handle;
    const update = (): void => {
      this.json = JSON.stringify(handle.exportW3C(), null, 2);
    };
    update();
    const stops = [handle.annotations.subscribe(update)];
    this.#off = () => {
      for (const stop of stops) stop();
    };
  };

  #import(mode: 'replace' | 'merge'): void {
    this.warnings = [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.importText);
    } catch (error) {
      this.warnings = [`That is not JSON: ${(error as Error).message}`];
      return;
    }
    this.warnings = this.handle?.importW3C(parsed as W3CAnnotation[], mode) ?? [];
  }

  protected override render(): unknown {
    const current = IMAGES.find((i) => i.id === this.image) ?? IMAGES[0];
    return html`
      <div class="row">
        <label>Picture
          <select @change=${(e: Event) => {
            this.image = (e.target as HTMLSelectElement).value;
          }}>
            ${IMAGES.map((i) => html`<option value=${i.id} ?selected=${i.id === current.id}>${i.label}</option>`)}
          </select>
        </label>
      </div>
      <tessera-annotator
        src=${current.src}
        set-id=${`playground-${current.id}`}
        alt=${current.label}
        @annotator-ready=${this.#onReady}
      ></tessera-annotator>
      <details>
        <summary>W3C Web Annotation JSON</summary>
        <pre aria-label="Annotations as W3C Web Annotation JSON">${this.json}</pre>
        <label>Import
          <textarea placeholder="Paste a W3C Web Annotation list" .value=${this.importText} @input=${(
            e: Event,
          ) => {
            this.importText = (e.target as HTMLTextAreaElement).value;
          }}></textarea>
        </label>
        <div class="row">
          <button @click=${() => this.#import('merge')}>Merge</button>
          <button @click=${() => this.#import('replace')}>Replace</button>
        </div>
        ${this.warnings.length ? html`<ul class="warn">${this.warnings.map((w) => html`<li>${w}</li>`)}</ul>` : nothing}
      </details>
    `;
  }
}

if (!customElements.get('annotate-demo')) customElements.define('annotate-demo', AnnotateDemo);

export const annotateSection: Section = {
  id: 'annotator',
  label: 'Annotate',
  blurb:
    'Draw shapes over an image, label them, add notes, undo and redo. Open another tab as another person and the set stays in sync; reload and it is still there.',
  schema: AnnotatorConfig,
  load: () => import('@tessera-kit/annotator'),
  defaults: {
    labels: [
      { value: 'tent site', color: 'green' },
      { value: 'fire pit', color: 'red' },
      { value: 'water', color: 'blue' },
    ],
  },
  render: () => html`<annotate-demo></annotate-demo>`,
};
