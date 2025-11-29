import { describe, expect, it } from 'vitest';
import { Viewport } from '../src/engine/viewport.js';
import type { Point } from '../src/geometry/model.js';

const close = (a: Point, b: Point): void => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};

describe('Viewport', () => {
  const scales = [0.25, 1, 2.5, 8];
  const shifts: Point[] = [
    [0, 0],
    [120, -40],
    [-300, 250],
  ];
  const points: Point[] = [
    [0, 0],
    [10, 20],
    [-5, 700],
    [1234.5, -0.25],
  ];

  it.each(scales.flatMap((s) => shifts.map((t) => [s, t] as const)))(
    'round-trips screen and world at scale %s, shift %j',
    (scale, [tx, ty]) => {
      const v = new Viewport({ minScale: 0.01, maxScale: 100 });
      v.set({ scale, tx, ty });
      for (const p of points) {
        close(v.screenToWorld(v.worldToScreen(p)), p);
        close(v.worldToScreen(v.screenToWorld(p)), p);
      }
    },
  );

  it('keeps the world point under the pointer fixed while zooming', () => {
    const v = new Viewport();
    v.set({ scale: 1.5, tx: 40, ty: 10 });
    const pointer: Point = [300, 200];
    const before = v.screenToWorld(pointer);
    v.zoomAt(pointer, 2);
    expect(v.state.get().scale).toBeCloseTo(3);
    close(v.screenToWorld(pointer), before);
  });

  it('clamps the scale to the limits and does not drift at the limit', () => {
    const v = new Viewport({ minScale: 0.5, maxScale: 4 });
    v.zoomAt([100, 100], 100);
    expect(v.state.get().scale).toBe(4);
    const at = v.state.get();
    v.zoomAt([100, 100], 2);
    expect(v.state.get()).toEqual(at);
    v.zoomAt([100, 100], 0.0001);
    expect(v.state.get().scale).toBe(0.5);
  });

  it('pans by screen pixels', () => {
    const v = new Viewport();
    v.panBy(15, -5);
    expect(v.state.get()).toEqual({ scale: 1, tx: 15, ty: -5 });
  });

  it('fits and centres a rect, leaving padding', () => {
    const v = new Viewport({ minScale: 0.01, maxScale: 8 });
    v.setSize(400, 300);
    v.fit({ x: 0, y: 0, w: 800, h: 400 }, 20);
    const { scale } = v.state.get();
    expect(scale).toBeCloseTo(360 / 800);
    close(v.worldToScreen([0, 0]), [20, (300 - 400 * scale) / 2]);
    close(v.worldToScreen([800, 400]), [380, (300 + 400 * scale) / 2]);
  });

  it('reports the visible world rect', () => {
    const v = new Viewport();
    v.setSize(200, 100);
    v.set({ scale: 2, tx: -100, ty: 0 });
    expect(v.visibleRect()).toEqual({ x: 50, y: 0, w: 100, h: 50 });
  });

  it('re-clamps the current scale when the limits change', () => {
    const v = new Viewport({ minScale: 0.1, maxScale: 8 });
    v.set({ scale: 6, tx: 0, ty: 0 });
    v.setLimits({ minScale: 0.1, maxScale: 3 });
    expect(v.state.get().scale).toBe(3);
  });

  it('ignores an unchanged size and a degenerate fit', () => {
    const v = new Viewport();
    let notified = 0;
    v.size.subscribe(() => notified++);
    v.setSize(100, 100);
    v.setSize(100, 100);
    expect(notified).toBe(1);
    expect(v.fitScale({ x: 0, y: 0, w: 0, h: 10 })).toBe(1);
  });
});
