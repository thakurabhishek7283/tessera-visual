import { describe, expect, it } from 'vitest';
import type { Geometry } from '../src/geometry/model.js';
import { at, click, drag, key, toolEngine } from './helpers.js';

const geometries = (engine: ReturnType<typeof toolEngine>['engine']): Geometry[] =>
  engine.store.list.get().map((a) => a.geometry);

describe('polygon tool', () => {
  const clickAll = (
    engine: ReturnType<typeof toolEngine>['engine'],
    ...ps: Array<[number, number]>
  ) => {
    for (const [x, y] of ps) click(engine, x, y);
  };

  it('closes by clicking the first vertex', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('polygon');
    clickAll(engine, [0, 0], [100, 0], [100, 100], [50, 120]);
    click(engine, 2, 2);
    await engine.settled();
    expect(geometries(engine)).toEqual([
      {
        type: 'polygon',
        points: [
          [0, 0],
          [100, 0],
          [100, 100],
          [50, 120],
        ],
      },
    ]);
  });

  it('finishes on double click without the duplicate vertex the second press adds', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('polygon');
    clickAll(engine, [0, 0], [100, 0], [100, 100], [50, 120], [50, 120]);
    engine.tools.doubleClick(at(engine, 50, 120));
    await engine.settled();
    const [g] = geometries(engine);
    expect(g?.type === 'polygon' && g.points).toHaveLength(4);
  });

  it('finishes with Enter, removes the last vertex with Backspace and cancels with Escape', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('polygon');
    clickAll(engine, [0, 0], [100, 0], [100, 100], [10, 90]);
    expect(engine.tools.keyDown(key('Backspace'))).toBe(true);
    expect(engine.tools.keyDown(key('Enter'))).toBe(true);
    await engine.settled();
    const [g] = geometries(engine);
    expect(g?.type === 'polygon' && g.points).toHaveLength(3);

    clickAll(engine, [300, 300], [320, 300], [320, 320]);
    expect(engine.tools.keyDown(key('Escape'))).toBe(true);
    await engine.settled();
    expect(geometries(engine)).toHaveLength(1);
    expect(engine.preview.get()).toBeNull();
  });

  it('draws nothing from fewer than three vertices', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('polygon');
    clickAll(engine, [0, 0], [100, 0]);
    engine.tools.keyDown(key('Enter'));
    await engine.settled();
    expect(geometries(engine)).toEqual([]);
  });

  it('previews the segment to the pointer', () => {
    const { engine } = toolEngine();
    engine.tools.setTool('polygon');
    clickAll(engine, [0, 0], [100, 0]);
    engine.tools.pointerMove(at(engine, 100, 100));
    const preview = engine.preview.get()?.geometry;
    expect(preview?.type).toBe('polygon');
    expect(preview && 'points' in preview && preview.points).toHaveLength(3);
  });

  it('ignores keys when nothing is in progress', () => {
    const { engine } = toolEngine();
    engine.tools.setTool('polygon');
    expect(engine.tools.keyDown(key('Enter'))).toBe(false);
  });
});

describe('polyline and arrow tools', () => {
  it('draws an open polyline that finishes on double click', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('polyline');
    click(engine, 0, 0);
    click(engine, 50, 50);
    click(engine, 100, 0);
    click(engine, 100, 0);
    engine.tools.doubleClick(at(engine, 100, 0));
    await engine.settled();
    expect(geometries(engine)).toEqual([
      {
        type: 'polyline',
        points: [
          [0, 0],
          [50, 50],
          [100, 0],
        ],
      },
    ]);
  });

  it('draws an arrow in one press-drag-release', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('arrow');
    drag(engine, [10, 10], [80, 40]);
    await engine.settled();
    expect(geometries(engine)).toEqual([
      {
        type: 'polyline',
        points: [
          [10, 10],
          [80, 40],
        ],
        arrowEnd: true,
      },
    ]);
  });

  it('draws a multi-segment arrow by clicking, finished with Enter', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('arrow');
    click(engine, 0, 0);
    click(engine, 60, 0);
    click(engine, 60, 60);
    engine.tools.keyDown(key('Enter'));
    await engine.settled();
    const [g] = geometries(engine);
    expect(g?.type === 'polyline' && g.arrowEnd).toBe(true);
    expect(g?.type === 'polyline' && g.points).toHaveLength(3);
  });

  it('draws nothing from a single click', async () => {
    const { engine } = toolEngine();
    engine.tools.setTool('polyline');
    click(engine, 5, 5);
    engine.tools.keyDown(key('Enter'));
    await engine.settled();
    expect(geometries(engine)).toEqual([]);
  });
});
