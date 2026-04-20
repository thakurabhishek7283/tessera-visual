import { baseStyles, TesseraElement } from '@tessera/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations, svg } from 'lit';
import { resolveColor } from '../engine/color.js';
import { bboxOf, unionRect } from '../geometry/bbox.js';
import type { Annotation, Rect } from '../geometry/model.js';
import type { AnnotatorHandle } from '../types.js';

/**
 * `<tessera-annotator-minimap>`: the whole surface at a glance, with the visible part outlined.
 * Press or drag inside it to move the view. A pointer convenience: the canvas is also reachable by
 * keyboard, so it is hidden from assistive technology.
 */
export class TesseraAnnotatorMinimap extends TesseraElement {
  static override properties: PropertyDeclarations = {
    handle: { attribute: false },
    image: {},
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: block;
        width: var(--tessera-annotator-minimap-width, 11rem);
        background: color-mix(in srgb, var(--tessera-color-bg) 88%, transparent);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        box-shadow: var(--tessera-shadow-sm);
        overflow: hidden;
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
        max-height: 8rem;
        cursor: crosshair;
        touch-action: none;
      }
      .view {
        fill: var(--tessera-color-primary);
        fill-opacity: 0.15;
        stroke: var(--tessera-color-primary);
        stroke-width: 2;
        vector-effect: non-scaling-stroke;
      }
      .shape {
        fill-opacity: 0.55;
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  handle: AnnotatorHandle | undefined;
  /** URL of the image to show behind the shapes (image mode). */
  image: string | undefined;

  #cache: { list: readonly Annotation[]; result: unknown } | undefined;

  /** Shapes as one block that is rebuilt only when the list changes, not on every pan. */
  #shapes(list: readonly Annotation[]): unknown {
    if (this.#cache?.list === list) return this.#cache.result;
    const result = svg`${list
      .filter((a) => !a.hidden)
      .map((a) => {
        const b = bboxOf(a.geometry);
        const color = resolveColor(a.style?.stroke);
        // Points and thin lines have no area; give them a visible minimum.
        return svg`<rect class="shape" x=${b.x} y=${b.y} width=${Math.max(b.w, 1)} height=${Math.max(b.h, 1)} style="fill:${color};stroke:${color}"></rect>`;
      })}`;
    this.#cache = { list, result };
    return result;
  }

  #visible(h: AnnotatorHandle): Rect {
    const { scale, tx, ty } = h.view.get();
    const { w, h: height } = h.viewSize.get();
    return { x: -tx / scale, y: -ty / scale, w: w / scale, h: height / scale };
  }

  #pan = (event: PointerEvent): void => {
    const h = this.handle;
    const el = event.currentTarget as SVGSVGElement;
    const m = el.getScreenCTM();
    if (!h || !m) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
    h.panTo(p.x, p.y);
  };

  #onDown = (event: PointerEvent): void => {
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    this.#pan(event);
  };

  #onMove = (event: PointerEvent): void => {
    if (event.buttons & 1) this.#pan(event);
  };

  protected override render(): unknown {
    const h = this.handle;
    if (!h) return nothing;
    const list = this.observe(h.annotations);
    this.observe(h.view);
    this.observe(h.viewSize);
    const visible = this.#visible(h);
    // The picture covers the content; on an endless board it also has to cover what is in view.
    const world = h.mode === 'board' ? unionRect(h.contentRect(), visible) : h.contentRect();
    const pad = Math.max(world.w, world.h) * 0.04;
    const box = { x: world.x - pad, y: world.y - pad, w: world.w + pad * 2, h: world.h + pad * 2 };
    return html`<svg
      viewBox="${box.x} ${box.y} ${box.w} ${box.h}"
      aria-hidden="true"
      @pointerdown=${this.#onDown}
      @pointermove=${this.#onMove}
    >
      ${
        this.image && h.mode === 'image'
          ? svg`<image href=${this.image} x=${world.x} y=${world.y} width=${world.w} height=${world.h}></image>`
          : nothing
      }
      ${this.#shapes(list)}
      <rect class="view" x=${visible.x} y=${visible.y} width=${visible.w} height=${visible.h}></rect>
    </svg>`;
  }
}
