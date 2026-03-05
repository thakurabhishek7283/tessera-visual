import { describe, expect, it } from 'vitest';
import type { Annotation, Geometry } from '../src/geometry/model.js';
import { at, click, drag, toolEngine } from './helpers.js';

const _geometries = (engine: ReturnType<typeof toolEngine>['engine']): Geometry[] =>
  engine.store.list.get().map((a) => a.geometry);

describe('freehand tool', () => {
  it('stores the stroke with pressure, simplified, and the brush size from the config', async () => {
    const { engine } = toolEngine({
      freehand: { size: 9, thinning: 0.5, smoothing: 0.5, streamline: 0.5 },
    });
    engine.tools.setTool('freehand');
    engine.tools.pointerDown(at(engine, 0, 0, { pressure: 0.2 }));
    for (let x = 10; x <= 100; x += 10)
      engine.tools.pointerMove(at(engine, x, 0, { pressure: 0.7 }));
    engine.tools.pointerUp(at(engine, 100, 0, { pressure: 0.7 }));
    await engine.settled();
    const a = engine.store.list.get()[0] as Annotation;
    expect(a.geometry.type).toBe('freehand');
    const pts = a.geometry.type === 'freehand' ? a.geometry.points : [];
    expect(pts[0]).toEqual([0, 0, 0.2]);
    expect(pts.length).toBeLessThan(11);
    expect(a.style?.strokeWidth).toBe(9);
  });

  it('shows the stroke while it is drawn', () => {
    const { engine } = toolEngine();
    engine.tools.setTool('freehand');
    engine.tools.pointerDown(at(engine, 0, 0));
    engine.tools.pointerMove(at(engine, 30, 5));
    expect(engine.preview.get()?.geometry.type).toBe('freehand');
    engine.tools.cancel();
    expect(engine.preview.get()).toBeNull();
  });

  it('turns a tap into a dot', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('freehand');
    click(engine, 40, 40);
    await engine.settled();
    expect(engine.store.list.get()).toHaveLength(1);
  });

  it('sizes the brush from the stroke width on a board', async () => {
    const { engine } = toolEngine({}, 'board');
    engine.drawStyle.set({ ...engine.drawStyle.get(), strokeWidth: 5 });
    engine.tools.setTool('freehand');
    drag(engine, [0, 0], [30, 30]);
    await engine.settled();
    expect(engine.store.list.get()[0]?.style?.strokeWidth).toBe(10);
  });
});
