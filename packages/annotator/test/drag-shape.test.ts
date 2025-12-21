import { describe, expect, it, vi } from 'vitest';
import type { Annotation, Geometry } from '../src/geometry/model.js';
import { at, click, drag, key, ptr, put, rectOf, toolEngine } from './helpers.js';

const geometries = (engine: ReturnType<typeof toolEngine>['engine']): Geometry[] =>
  engine.store.list.get().map((a) => a.geometry);

describe('rect and ellipse tools', () => {
  it('draws a rect from corner to corner, whichever way it is dragged', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('rect');
    drag(engine, [100, 100], [60, 40], [20, 30]);
    await engine.settled();
    expect(geometries(engine)).toEqual([{ type: 'rect', x: 20, y: 30, w: 80, h: 70 }]);
    expect(engine.selection.ids.get()).toHaveLength(1);
    expect(engine.preview.get()).toBeNull();
  });

  it('previews while dragging', () => {
    const { engine } = toolEngine();
    engine.tools.setTool('rect');
    engine.tools.pointerDown(at(engine, 10, 10));
    engine.tools.pointerMove(at(engine, 50, 40));
    expect(engine.preview.get()?.geometry).toEqual({ type: 'rect', x: 10, y: 10, w: 40, h: 30 });
    engine.tools.pointerUp(at(engine, 50, 40));
    expect(engine.preview.get()).toBeNull();
  });

  it('makes a square with shift, and grows from the centre with alt', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('rect');
    drag(engine, [100, 100], [160, 130, { shift: true }]);
    drag(engine, [300, 300], [330, 320, { alt: true }]);
    await engine.settled();
    expect(geometries(engine)).toEqual([
      { type: 'rect', x: 100, y: 100, w: 60, h: 60 },
      { type: 'rect', x: 270, y: 280, w: 60, h: 40 },
    ]);
  });

  it('treats a drag under 3 screen pixels as a click and draws nothing', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('rect');
    drag(engine, [100, 100], [102, 101]);
    await engine.settled();
    expect(geometries(engine)).toEqual([]);
  });

  it('counts the 3 pixels on screen, not in the world, when zoomed', async () => {
    const { engine } = toolEngine();
    engine.viewport.set({ scale: 4, tx: 0, ty: 0 });
    engine.tools.setTool('rect');
    drag(engine, [10, 10], [10.6, 10.6]);
    await engine.settled();
    expect(geometries(engine)).toHaveLength(1);
  });

  it('cancels with Escape', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('rect');
    engine.tools.pointerDown(at(engine, 10, 10));
    engine.tools.pointerMove(at(engine, 80, 80));
    expect(engine.tools.keyDown(key('Escape'))).toBe(true);
    engine.tools.pointerUp(at(engine, 80, 80));
    await engine.settled();
    expect(geometries(engine)).toEqual([]);
    expect(engine.preview.get()).toBeNull();
  });

  it('snaps its first corner to a vertex of another shape', async () => {
    const { engine } = toolEngine();
    put(engine, rectOf(200, 200, 50, 50));
    engine.tools.setTool('rect');
    drag(engine, [203, 198], [300, 300]);
    await engine.settled();
    expect(geometries(engine)[1]).toEqual({ type: 'rect', x: 200, y: 200, w: 100, h: 100 });
  });

  it('draws an ellipse from its bounding box, and a circle with shift', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('ellipse');
    drag(engine, [0, 0], [100, 60]);
    drag(engine, [200, 200], [260, 230, { shift: true }]);
    await engine.settled();
    expect(geometries(engine)).toEqual([
      { type: 'ellipse', cx: 50, cy: 30, rx: 50, ry: 30 },
      { type: 'ellipse', cx: 230, cy: 230, rx: 30, ry: 30 },
    ]);
  });

  it('gives a new shape the colour of the default label', async () => {
    const { engine } = toolEngine({ labels: [{ value: 'tent', color: 'green' }] });
    engine.tools.setTool('rect');
    drag(engine, [0, 0], [50, 50]);
    await engine.settled();
    expect(engine.store.list.get()[0]?.style?.stroke).toBe('green');
  });
});
