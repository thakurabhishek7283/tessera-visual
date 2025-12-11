import type { Unsubscribe } from '@tessera/core';
import { LINE_HEIGHT, type TextMeasure } from '../geometry/bbox.js';
import type { Annotation, Point, Rect, Style } from '../geometry/model.js';
import type { AnnotatorEngine } from './engine.js';
import { describeShape, type SvgNode } from './shape-svg.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function build(node: SvgNode): SVGElement {
  const el = document.createElementNS(SVG_NS, node.tag);
  for (const [k, v] of Object.entries(node.attrs)) el.setAttribute(k, String(v));
  for (const [k, v] of Object.entries(node.style)) el.style.setProperty(k, String(v));
  if (node.text !== undefined) el.textContent = node.text;
  for (const child of node.children ?? []) el.append(build(child));
  return el;
}

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

interface Dirty {
  shapes: boolean;
  view: boolean;
  overlay: boolean;
  preview: boolean;
}

interface Painted {
  node: SVGGElement;
  annotation: Annotation;
}

/**
 * Paints the engine into an SVG. Shapes live in one transformed group, so panning and zooming only
 * change a `transform` attribute and never touch the shapes. Updates are batched into a frame.
 */
export class Renderer {
  readonly svg: SVGSVGElement;
  readonly world: SVGGElement;
  readonly shapes: SVGGElement;
  readonly preview: SVGGElement;
  /** Screen-space layer: selection outlines, handles and the snap indicator keep a constant size. */
  readonly overlay: SVGGElement;
  readonly #engine: AnnotatorEngine;
  readonly #painted = new Map<string, Painted>();
  readonly #offs: Unsubscribe[] = [];
  readonly #probe: SVGTextElement;
  readonly #measured = new Map<string, { w: number; h: number }>();
  #frame = 0;
  #dirty: Dirty = { shapes: true, view: true, overlay: true, preview: true };

  constructor(engine: AnnotatorEngine, svg: SVGSVGElement) {
    this.#engine = engine;
    this.svg = svg;
    this.world = svgEl('g', { class: 'world' }) as SVGGElement;
    this.shapes = svgEl('g', { class: 'shapes' }) as SVGGElement;
    this.preview = svgEl('g', { class: 'preview', 'pointer-events': 'none' }) as SVGGElement;
    this.overlay = svgEl('g', { class: 'overlay', 'pointer-events': 'none' }) as SVGGElement;
    this.world.append(this.shapes, this.preview);

    // Hidden text node used to measure text shapes with the real font.
    this.#probe = svgEl('text', { visibility: 'hidden', 'aria-hidden': 'true' }) as SVGTextElement;
    this.#probe.style.setProperty(
      'font-family',
      'var(--tessera-font-family, system-ui, sans-serif)',
    );
    this.svg.append(this.world, this.overlay, this.#probe);

    engine.index.setMeasure(this.#measure);
    this.#offs.push(
      engine.store.list.subscribe(() => this.#invalidate('shapes', 'overlay')),
      engine.viewport.state.subscribe(() => this.#invalidate('view', 'overlay')),
      engine.viewport.size.subscribe(() => this.#invalidate('overlay')),
      engine.selection.ids.subscribe(() => this.#invalidate('overlay')),
      engine.preview.subscribe(() => this.#invalidate('preview')),
      engine.snapIndicator.subscribe(() => this.#invalidate('overlay')),
      engine.marquee.subscribe(() => this.#invalidate('overlay')),
    );
    this.flush();
  }

  readonly #measure: TextMeasure = (g) => {
    const key = `${g.fontSize}|${g.text}`;
    const known = this.#measured.get(key);
    if (known) return known;
    this.#probe.setAttribute('font-size', String(g.fontSize));
    this.#probe.replaceChildren(
      ...g.text.split('\n').map((line, i) => {
        const span = svgEl('tspan', { x: 0, ...(i > 0 ? { dy: `${LINE_HEIGHT}em` } : {}) });
        span.textContent = line === '' ? ' ' : line;
        return span;
      }),
    );
    const box = this.#probe.getBBox();
    const lines = g.text.split('\n').length;
    // Detached or not laid out yet: fall back to the estimate rather than a zero-size box.
    if (box.width <= 0) {
      return {
        w: Math.max(g.text.length, 1) * g.fontSize * 0.6,
        h: lines * g.fontSize * LINE_HEIGHT,
      };
    }
    const size = { w: box.width, h: Math.max(box.height, lines * g.fontSize * LINE_HEIGHT * 0.8) };
    this.#measured.set(key, size);
    return size;
  };

  #invalidate(...parts: Array<keyof Dirty>): void {
    for (const p of parts) this.#dirty[p] = true;
    if (this.#frame === 0) this.#frame = requestAnimationFrame(() => this.flush());
  }

  /** Paints now. Normally called from the animation frame; tests call it directly. */
  flush(): void {
    if (this.#frame !== 0) cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    const d = this.#dirty;
    this.#dirty = { shapes: false, view: false, overlay: false, preview: false };
    if (d.shapes) this.#paintShapes();
    if (d.view) {
      const { scale, tx, ty } = this.#engine.viewport.state.get();
      this.world.setAttribute('transform', `matrix(${scale} 0 0 ${scale} ${tx} ${ty})`);
    }
    if (d.preview) this.#paintPreview();
    if (d.overlay) this.#paintOverlay();
  }

  #paint(a: Annotation): SVGGElement {
    const node = svgEl('g', { 'data-id': a.id, 'aria-hidden': 'true' }) as SVGGElement;
    if (a.hidden) node.setAttribute('display', 'none');
    for (const part of describeShape(a, { strokeScales: this.#engine.strokeScales })) {
      node.append(build(part));
    }
    return node;
  }

  #paintShapes(): void {
    const list = this.#engine.store.list.get();
    const live = new Set<string>();
    list.forEach((a, i) => {
      live.add(a.id);
      const had = this.#painted.get(a.id);
      let node = had?.node;
      if (!had || had.annotation !== a) {
        const fresh = this.#paint(a);
        had?.node.replaceWith(fresh);
        node = fresh;
        this.#painted.set(a.id, { node: fresh, annotation: a });
      }
      if (node && this.shapes.children[i] !== node) {
        this.shapes.insertBefore(node, this.shapes.children[i] ?? null);
      }
    });
    for (const [id, p] of this.#painted) {
      if (live.has(id)) continue;
      p.node.remove();
      this.#painted.delete(id);
    }
  }

  #paintPreview(): void {
    this.preview.replaceChildren();
    const p = this.#engine.preview.get();
    if (!p) return;
    const style: Style = { ...this.#engine.drawStyle.get(), ...p.style };
    const draft: Annotation = {
      id: 'preview',
      geometry: p.geometry,
      bodies: [],
      style: { ...style, opacity: 0.85 },
      createdAt: '',
      updatedAt: '',
    };
    for (const part of describeShape(draft, { strokeScales: this.#engine.strokeScales })) {
      this.preview.append(build(part));
    }
  }

  #paintOverlay(): void {
    this.overlay.replaceChildren();
    const engine = this.#engine;
    const to = (p: Point): Point => engine.viewport.worldToScreen(p);
    const rectOverlay = (r: Rect, cls: string, pad = 0): SVGElement => {
      const [x0, y0] = to([r.x, r.y]);
      const [x1, y1] = to([r.x + r.w, r.y + r.h]);
      return svgEl('rect', {
        class: cls,
        x: Math.min(x0, x1) - pad,
        y: Math.min(y0, y1) - pad,
        width: Math.abs(x1 - x0) + pad * 2,
        height: Math.abs(y1 - y0) + pad * 2,
      });
    };

    for (const id of engine.selection.ids.get()) {
      const a = engine.store.get(id);
      if (a && !a.hidden) this.overlay.append(rectOverlay(engine.index.bbox(a), 'selection', 4));
    }
    const marquee = engine.marquee.get();
    if (marquee) this.overlay.append(rectOverlay(marquee, 'marquee'));
    const snap = engine.snapIndicator.get();
    if (snap) {
      const [x, y] = to(snap);
      this.overlay.append(svgEl('circle', { class: 'snap', cx: x, cy: y, r: 5 }));
    }
  }

  /** The painted node of an annotation, for tests and focus handling. */
  nodeOf(id: string): SVGGElement | undefined {
    return this.#painted.get(id)?.node;
  }

  destroy(): void {
    if (this.#frame !== 0) cancelAnimationFrame(this.#frame);
    for (const off of this.#offs.splice(0)) off();
    this.#engine.index.setMeasure(undefined);
    this.world.remove();
    this.overlay.remove();
    this.#probe.remove();
    this.#painted.clear();
  }
}
