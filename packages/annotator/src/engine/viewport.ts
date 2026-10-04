import type { Store } from '@tessera-kit/core';
import { createStore } from '@tessera-kit/core';
import { clamp } from '../geometry/math.js';
import type { Point, Rect } from '../geometry/model.js';

/** `screen = world * scale + translate` */
export interface ViewState {
  scale: number;
  tx: number;
  ty: number;
}

export interface ViewportLimits {
  minScale: number;
  maxScale: number;
}

/** The transform between world coordinates (image pixels or board units) and the screen. */
export class Viewport {
  readonly state: Store<ViewState> = createStore<ViewState>({ scale: 1, tx: 0, ty: 0 });
  readonly size: Store<{ w: number; h: number }> = createStore({ w: 0, h: 0 });
  #limits: ViewportLimits;

  constructor(limits: ViewportLimits = { minScale: 0.1, maxScale: 8 }) {
    this.#limits = limits;
  }

  get limits(): ViewportLimits {
    return this.#limits;
  }

  setLimits(limits: ViewportLimits): void {
    this.#limits = limits;
    const { scale, tx, ty } = this.state.get();
    this.#apply(scale, tx, ty);
  }

  setSize(w: number, h: number): void {
    const prev = this.size.get();
    if (prev.w === w && prev.h === h) return;
    this.size.set({ w, h });
  }

  screenToWorld(p: Point): Point {
    const { scale, tx, ty } = this.state.get();
    return [(p[0] - tx) / scale, (p[1] - ty) / scale];
  }

  worldToScreen(p: Point): Point {
    const { scale, tx, ty } = this.state.get();
    return [p[0] * scale + tx, p[1] * scale + ty];
  }

  /** The part of the world that is visible. */
  visibleRect(): Rect {
    const { w, h } = this.size.get();
    const [x0, y0] = this.screenToWorld([0, 0]);
    const [x1, y1] = this.screenToWorld([w, h]);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  #apply(scale: number, tx: number, ty: number): void {
    this.state.set({ scale: clamp(scale, this.#limits.minScale, this.#limits.maxScale), tx, ty });
  }

  set(next: ViewState): void {
    this.#apply(next.scale, next.tx, next.ty);
  }

  panBy(dx: number, dy: number): void {
    const { scale, tx, ty } = this.state.get();
    this.state.set({ scale, tx: tx + dx, ty: ty + dy });
  }

  /** Zooms by `factor` keeping the world point under `screen` where it is. */
  zoomAt(screen: Point, factor: number): void {
    const { scale, tx, ty } = this.state.get();
    const next = clamp(scale * factor, this.#limits.minScale, this.#limits.maxScale);
    const ratio = next / scale;
    this.state.set({
      scale: next,
      tx: screen[0] - (screen[0] - tx) * ratio,
      ty: screen[1] - (screen[1] - ty) * ratio,
    });
  }

  /** Zooms about the centre of the view. */
  zoomBy(factor: number): void {
    const { w, h } = this.size.get();
    this.zoomAt([w / 2, h / 2], factor);
  }

  /** The scale at which `rect` fills the view with `padding` pixels around it. */
  fitScale(rect: Rect, padding = 16): number {
    const { w, h } = this.size.get();
    if (w <= 0 || h <= 0 || rect.w <= 0 || rect.h <= 0) return 1;
    return Math.min((w - padding * 2) / rect.w, (h - padding * 2) / rect.h);
  }

  /** Centres `rect` in the view at the largest scale that shows all of it. */
  fit(rect: Rect, padding = 16): void {
    const { w, h } = this.size.get();
    const scale = clamp(this.fitScale(rect, padding), this.#limits.minScale, this.#limits.maxScale);
    this.state.set({
      scale,
      tx: (w - rect.w * scale) / 2 - rect.x * scale,
      ty: (h - rect.h * scale) / 2 - rect.y * scale,
    });
  }
}
