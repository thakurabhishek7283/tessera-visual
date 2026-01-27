import { describe, expect, it } from 'vitest';
import type { Annotation } from '../src/geometry/model.js';
import { computeHandles } from '../src/tools/handles.js';
import { at, click, drag, put, rectOf, toolEngine } from './helpers.js';

type E = ReturnType<typeof toolEngine>['engine'];

const geometryOf = (engine: E, a: Annotation) => engine.store.get(a.id)?.geometry;
const handle = (
  engine: E,
  a: Annotation,
  pick: (h: ReturnType<typeof computeHandles>[number]) => boolean,
) => {
  const h = computeHandles(engine.effective(engine.store.get(a.id) as Annotation).geometry).find(
    pick,
  );
  if (!h) throw new Error('no such handle');
  return h;
};

describe('select tool: choosing', () => {
  it('selects the topmost shape, toggles with shift and clears on empty space', () => {
    const { engine } = toolEngine();
    const a = put(engine, rectOf(0, 0, 100, 100));
    const b = put(engine, rectOf(50, 50, 100, 100));
    click(engine, 75, 75);
    expect(engine.selection.ids.get()).toEqual([b.id]);
    click(engine, 10, 10, { shift: true });
    expect(engine.selection.ids.get()).toEqual([b.id, a.id]);
    click(engine, 75, 75, { shift: true });
    expect(engine.selection.ids.get()).toEqual([a.id]);
    click(engine, 500, 500);
    expect(engine.selection.ids.get()).toEqual([]);
  });

  it('keeps a multi-selection when you press one of its members, so all of it can be dragged', () => {
    const { engine } = toolEngine();
    const a = put(engine, rectOf(0, 0, 40, 40));
    const b = put(engine, rectOf(100, 0, 40, 40));
    engine.selection.set([a.id, b.id]);
    engine.tools.pointerDown(at(engine, 10, 10));
    expect(engine.selection.ids.get()).toEqual([a.id, b.id]);
  });

  it('changes the cursor over shapes and grips', () => {
    const { engine } = toolEngine();
    const a = put(engine, rectOf(100, 100, 100, 100));
    engine.tools.pointerMove(at(engine, 150, 150));
    expect(engine.cursor.get()).toBe('move');
    engine.tools.pointerMove(at(engine, 400, 400));
    expect(engine.cursor.get()).toBe('default');
    engine.selection.set([a.id]);
    engine.tools.pointerMove(at(engine, 200, 200));
    expect(engine.cursor.get()).toBe('nwse-resize');
  });
});

describe('select tool: moving', () => {
  it('previews a move, then stores it once as one undo step', async () => {
    const { engine } = toolEngine();
    const a = put(engine, rectOf(0, 0, 40, 40));
    engine.tools.pointerDown(at(engine, 10, 10));
    engine.tools.pointerMove(at(engine, 60, 40));
    expect(engine.drafts.get().get(a.id)).toMatchObject({ x: 50, y: 30 });
    expect(geometryOf(engine, a)).toMatchObject({ x: 0, y: 0 });
    engine.tools.pointerMove(at(engine, 110, 10));
    engine.tools.pointerUp(at(engine, 110, 10));
    expect(geometryOf(engine, a)).toMatchObject({ x: 100, y: 0 });
    expect(engine.drafts.get().size).toBe(0);
    await engine.history.undo();
    expect(geometryOf(engine, a)).toMatchObject({ x: 0, y: 0 });
    await engine.history.undo();
    expect(engine.store.list.get()).toEqual([]);
  });

  it('moves every selected shape and ignores jitter below the drag threshold', () => {
    const { engine } = toolEngine();
    const a = put(engine, rectOf(0, 0, 40, 40));
    const b = put(engine, { type: 'ellipse', cx: 200, cy: 20, rx: 20, ry: 20 });
    engine.selection.set([a.id, b.id]);
    drag(engine, [10, 10], [11, 11]);
    expect(geometryOf(engine, a)).toMatchObject({ x: 0, y: 0 });
    drag(engine, [10, 10], [30, 50]);
    expect(geometryOf(engine, a)).toMatchObject({ x: 20, y: 40 });
    expect(geometryOf(engine, b)).toMatchObject({ cx: 220, cy: 60 });
  });

  it('selects locked shapes but does not move them', () => {
    const { engine } = toolEngine();
    const locked = put(engine, rectOf(0, 0, 40, 40), { locked: true });
    drag(engine, [10, 10], [80, 80]);
    expect(engine.selection.ids.get()).toEqual([locked.id]);
    expect(geometryOf(engine, locked)).toMatchObject({ x: 0, y: 0 });
  });

  it('selects but does not move when read-only', () => {
    const { engine } = toolEngine({ readOnly: true });
    const a = put(engine, rectOf(0, 0, 40, 40));
    drag(engine, [10, 10], [80, 80]);
    expect(engine.selection.ids.get()).toEqual([a.id]);
    expect(geometryOf(engine, a)).toMatchObject({ x: 0, y: 0 });
  });

  it('abandons a drag when cancelled', () => {
    const { engine } = toolEngine();
    const a = put(engine, rectOf(0, 0, 40, 40));
    engine.tools.pointerDown(at(engine, 10, 10));
    engine.tools.pointerMove(at(engine, 90, 90));
    engine.tools.cancel();
    expect(engine.drafts.get().size).toBe(0);
    expect(geometryOf(engine, a)).toMatchObject({ x: 0, y: 0 });
  });
});

describe('select tool: resizing', () => {
  it('drags the corner grip and keeps the opposite corner in place', () => {
    const { engine } = toolEngine();
    const a = put(engine, rectOf(100, 100, 100, 50));
    engine.selection.set([a.id]);
    const grip = handle(engine, a, (h) => h.kind === 'resize' && h.dir?.sx === 1 && h.dir.sy === 1);
    drag(engine, grip.at, [260, 220]);
    expect(geometryOf(engine, a)).toEqual({ type: 'rect', x: 100, y: 100, w: 160, h: 120 });
  });

  it('drags an edge grip on one axis only', () => {
    const { engine } = toolEngine();
    const a = put(engine, rectOf(100, 100, 100, 50));
    engine.selection.set([a.id]);
    const grip = handle(
      engine,
      a,
      (h) => h.kind === 'resize' && h.dir?.sx === -1 && h.dir.sy === 0,
    );
    drag(engine, grip.at, [60, 400]);
    expect(geometryOf(engine, a)).toEqual({ type: 'rect', x: 60, y: 100, w: 140, h: 50 });
  });

  it('keeps the aspect ratio with shift, and flips when dragged past the opposite corner', () => {
    const { engine } = toolEngine();
    const a = put(engine, rectOf(100, 100, 100, 50));
    engine.selection.set([a.id]);
    const grip = handle(engine, a, (h) => h.kind === 'resize' && h.dir?.sx === 1 && h.dir.sy === 1);
    drag(engine, grip.at, [300, 130, { shift: true }]);
    expect(geometryOf(engine, a)).toEqual({ type: 'rect', x: 100, y: 100, w: 200, h: 100 });

    const b = put(engine, rectOf(500, 500, 100, 100));
    engine.selection.set([b.id]);
    const corner = handle(
      engine,
      b,
      (h) => h.kind === 'resize' && h.dir?.sx === 1 && h.dir.sy === 1,
    );
    drag(engine, corner.at, [450, 450]);
    expect(geometryOf(engine, b)).toEqual({ type: 'rect', x: 450, y: 450, w: 50, h: 50 });
  });

  it('resizes an ellipse', () => {
    const { engine } = toolEngine();
    const a = put(engine, { type: 'ellipse', cx: 100, cy: 100, rx: 50, ry: 30 });
    engine.selection.set([a.id]);
    const grip = handle(engine, a, (h) => h.kind === 'resize' && h.dir?.sx === 1 && h.dir.sy === 0);
    drag(engine, grip.at, [200, 100]);
    expect(geometryOf(engine, a)).toEqual({ type: 'ellipse', cx: 125, cy: 100, rx: 75, ry: 30 });
  });

  it('undoes a resize in one step', async () => {
    const { engine } = toolEngine();
    const a = put(engine, rectOf(100, 100, 100, 50));
    engine.selection.set([a.id]);
    const grip = handle(engine, a, (h) => h.kind === 'resize' && h.dir?.sx === 1 && h.dir.sy === 1);
    drag(engine, grip.at, [150, 150], [260, 220]);
    await engine.history.undo();
    expect(geometryOf(engine, a)).toEqual(a.geometry);
  });

  it('offers no grips on a locked shape or with several selected', () => {
    const { engine } = toolEngine();
    const locked = put(engine, rectOf(100, 100, 100, 50), { locked: true });
    engine.selection.set([locked.id]);
    drag(engine, [200, 150], [300, 300]);
    expect(geometryOf(engine, locked)).toMatchObject({ w: 100, h: 50 });
  });
});

describe('select tool: vertices', () => {
  const tri = {
    type: 'polygon' as const,
    points: [
      [0, 0],
      [200, 0],
      [100, 150],
    ] as Array<[number, number]>,
  };

  it('drags a vertex', () => {
    const { engine } = toolEngine();
    const a = put(engine, tri);
    engine.selection.set([a.id]);
    drag(engine, [200, 0], [250, 40]);
    expect(geometryOf(engine, a)).toMatchObject({
      points: [
        [0, 0],
        [250, 40],
        [100, 150],
      ],
    });
  });

  it('inserts a vertex by dragging a midpoint grip', () => {
    const { engine } = toolEngine();
    const a = put(engine, tri);
    engine.selection.set([a.id]);
    drag(engine, [100, 0], [100, -60]);
    expect(geometryOf(engine, a)).toMatchObject({
      points: [
        [0, 0],
        [100, -60],
        [200, 0],
        [100, 150],
      ],
    });
  });

  it('inserts a vertex on the closing edge of a polygon', () => {
    const { engine } = toolEngine();
    const a = put(engine, tri);
    engine.selection.set([a.id]);
    drag(engine, [50, 75], [20, 100]);
    const g = geometryOf(engine, a);
    expect(g?.type === 'polygon' && g.points).toHaveLength(4);
  });

  it('deletes a vertex with alt+click but never goes below three', () => {
    const { engine } = toolEngine();
    const quad = put(engine, {
      type: 'polygon',
      points: [
        [0, 0],
        [200, 0],
        [200, 100],
        [0, 100],
      ],
    });
    engine.selection.set([quad.id]);
    click(engine, 200, 100, { alt: true });
    expect(geometryOf(engine, quad)).toMatchObject({
      points: [
        [0, 0],
        [200, 0],
        [0, 100],
      ],
    });
    click(engine, 0, 100, { alt: true });
    expect(geometryOf(engine, quad)).toMatchObject({
      points: [
        [0, 0],
        [200, 0],
        [0, 100],
      ],
    });
  });

  it('edits polylines too, down to two points', () => {
    const { engine } = toolEngine();
    const line = put(engine, {
      type: 'polyline',
      points: [
        [0, 0],
        [100, 0],
        [200, 100],
      ],
    });
    engine.selection.set([line.id]);
    click(engine, 100, 0, { alt: true });
    const g = geometryOf(engine, line);
    expect(g?.type === 'polyline' && g.points).toHaveLength(2);
    click(engine, 0, 0, { alt: true });
    expect(g?.type === 'polyline' && geometryOf(engine, line)).toMatchObject({
      points: [
        [0, 0],
        [200, 100],
      ],
    });
  });

  it('snaps a dragged vertex to another shape', () => {
    const { engine } = toolEngine();
    const a = put(engine, tri);
    put(engine, { type: 'point', x: 300, y: 50 });
    engine.selection.set([a.id]);
    drag(engine, [200, 0], [303, 48]);
    expect(geometryOf(engine, a)).toMatchObject({
      points: [
        [0, 0],
        [300, 50],
        [100, 150],
      ],
    });
  });
});

describe('select tool: marquee', () => {
  const setup = () => {
    const { engine } = toolEngine();
    const small = put(engine, rectOf(20, 20, 20, 20));
    const big = put(engine, rectOf(0, 0, 300, 300), { style: { fill: 'none' } });
    const far = put(engine, rectOf(500, 500, 20, 20));
    return { engine, small, big, far };
  };

  it('selects what the box touches', () => {
    const { engine, small, big } = setup();
    engine.tools.pointerDown(at(engine, 380, 380));
    engine.tools.pointerMove(at(engine, 10, 10));
    expect(engine.marquee.get()).toEqual({ x: 10, y: 10, w: 370, h: 370 });
    engine.tools.pointerUp(at(engine, 10, 10));
    expect(engine.marquee.get()).toBeNull();
    expect(engine.selection.ids.get()).toEqual([small.id, big.id]);
  });

  it('selects only what the box contains with alt', () => {
    const { engine, small } = setup();
    drag(engine, [380, 380], [10, 10, { alt: true }]);
    expect(engine.selection.ids.get()).toEqual([small.id]);
  });

  it('adds to the selection with shift', () => {
    const { engine, small, far } = setup();
    click(engine, 505, 505);
    drag(engine, [15, 15], [45, 45, { shift: true }]);
    expect(engine.selection.ids.get()).toContain(far.id);
    expect(engine.selection.ids.get()).toContain(small.id);
  });

  it('does not select hidden shapes', () => {
    const { engine, small } = setup();
    engine.update(small.id, { hidden: true });
    drag(engine, [15, 15], [45, 45]);
    expect(engine.selection.ids.get()).not.toContain(small.id);
  });
});

describe('select tool: text', () => {
  it('edits a text on double click', async () => {
    const { engine } = toolEngine();
    const t = put(engine, { type: 'text', x: 10, y: 10, text: 'a', fontSize: 14 });
    engine.hooks.editText = async () => 'b';
    engine.tools.doubleClick(at(engine, 12, 12));
    await new Promise((r) => setTimeout(r, 0));
    expect(geometryOf(engine, t)).toMatchObject({ text: 'b' });
  });
});
