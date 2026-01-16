import { describe, expect, it, vi } from 'vitest';
import type { Annotation, Geometry } from '../src/geometry/model.js';
import { at, click, drag, key, ptr, put, rectOf, toolEngine } from './helpers.js';

const geometries = (engine: ReturnType<typeof toolEngine>['engine']): Geometry[] =>
  engine.store.list.get().map((a) => a.geometry);

describe('eraser tool', () => {
  it('dims what it touches and deletes it all as one undo step on release', async () => {
    const { engine } = toolEngine();
    const a = put(engine, rectOf(0, 0, 20, 20), { style: { fill: 'none' } });
    const b = put(engine, rectOf(100, 0, 20, 20), { style: { fill: 'none' } });
    const far = put(engine, rectOf(0, 200, 20, 20));
    engine.tools.setTool('eraser');
    engine.tools.pointerDown(at(engine, 0, 10));
    engine.tools.pointerMove(at(engine, 60, 10));
    engine.tools.pointerMove(at(engine, 120, 10));
    expect(engine.erasing.get()).toEqual([a.id, b.id]);
    expect(engine.store.list.get()).toHaveLength(3);
    engine.tools.pointerUp(at(engine, 120, 10));
    expect(engine.store.list.get().map((x) => x.id)).toEqual([far.id]);
    expect(engine.erasing.get()).toEqual([]);
    await engine.history.undo();
    expect(engine.store.list.get()).toHaveLength(3);
  });

  it('catches a shape the pointer jumped across between two events', () => {
    const { engine } = toolEngine();
    put(engine, { type: 'point', x: 50, y: 0 });
    engine.tools.setTool('eraser');
    engine.tools.pointerDown(at(engine, 0, 0));
    engine.tools.pointerMove(at(engine, 100, 0));
    expect(engine.erasing.get()).toHaveLength(1);
  });

  it('leaves locked shapes alone and cancels with Escape', () => {
    const { engine } = toolEngine();
    put(engine, rectOf(0, 0, 20, 20), { locked: true });
    engine.tools.setTool('eraser');
    engine.tools.pointerDown(at(engine, 10, 10));
    expect(engine.erasing.get()).toEqual([]);
    put(engine, rectOf(100, 0, 20, 20));
    engine.tools.pointerMove(at(engine, 110, 10));
    expect(engine.erasing.get()).toHaveLength(1);
    expect(engine.tools.keyDown(key('Escape'))).toBe(true);
    engine.tools.pointerUp(at(engine, 110, 10));
    expect(engine.store.list.get()).toHaveLength(2);
  });
});

describe('pan tool', () => {
  it('moves the view by the screen distance dragged, however the view moves meanwhile', () => {
    const { engine } = toolEngine();
    engine.tools.setTool('pan');
    const screen = (x: number, y: number) => {
      const world = engine.viewport.screenToWorld([x, y]);
      return ptr(world[0], world[1], { screen: [x, y] });
    };
    engine.tools.pointerDown(screen(100, 100));
    engine.tools.pointerMove(screen(130, 90));
    engine.tools.pointerMove(screen(150, 80));
    engine.tools.pointerUp(screen(150, 80));
    expect(engine.viewport.state.get()).toMatchObject({ tx: 50, ty: -20 });
  });
});
