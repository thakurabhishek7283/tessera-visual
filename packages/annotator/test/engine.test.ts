import { describe, expect, it, vi } from 'vitest';
import { handleShortcut } from '../src/engine/shortcuts.js';
import type { Tool } from '../src/engine/tools.js';
import { key, makeEngine, ptr, put, rectOf } from './helpers.js';

/** A tool that records what it was sent. */
function spyTool(id: Tool['id'], log: string[]): Tool {
  return {
    id,
    cursor: `cursor-${id}`,
    onPointerDown: (e) => log.push(`${id}:down:${e.world.join(',')}`),
    onPointerMove: (e) => log.push(`${id}:move:${e.world.join(',')}`),
    onPointerUp: (e) => log.push(`${id}:up:${e.world.join(',')}`),
    onKeyDown: (e) => {
      log.push(`${id}:key:${e.key}`);
      return e.key === 'Enter';
    },
    cancel: () => log.push(`${id}:cancel`),
  };
}

describe('ToolManager', () => {
  const setup = (config = {}) => {
    const log: string[] = [];
    const t = makeEngine({ tools: ['select', 'rect', 'ellipse'], ...config }, 'image', (engine) => {
      for (const id of ['select', 'rect', 'ellipse', 'pan', 'polygon'] as const) {
        engine.tools.register(spyTool(id, log));
      }
    });
    return { ...t, log };
  };

  it('starts on the default tool and routes pointer events to it', () => {
    const { engine, log } = setup();
    expect(engine.tools.active.get()).toBe('select');
    engine.tools.pointerDown(ptr(1, 2));
    engine.tools.pointerMove(ptr(3, 4));
    engine.tools.pointerUp(ptr(5, 6));
    expect(log).toEqual(['select:down:1,2', 'select:move:3,4', 'select:up:5,6']);
  });

  it('ignores a pointer up that did not start with a pointer down', () => {
    const { engine, log } = setup();
    engine.tools.pointerUp(ptr(5, 6));
    expect(log).toEqual([]);
  });

  it('cancels the old tool when switching, and sets the new cursor', () => {
    const { engine, log } = setup();
    expect(engine.tools.setTool('rect')).toBe(true);
    expect(log).toContain('select:cancel');
    expect(engine.cursor.get()).toBe('cursor-rect');
  });

  it('refuses tools that are not configured, but pan is always available', () => {
    const { engine } = setup();
    expect(engine.tools.setTool('polygon')).toBe(false);
    expect(engine.tools.active.get()).toBe('select');
    expect(engine.tools.setTool('pan')).toBe(true);
  });

  it('only offers select and pan when read-only', () => {
    const { engine } = setup({ readOnly: true });
    expect(engine.tools.setTool('rect')).toBe(false);
    expect(engine.toolEnabled('select')).toBe(true);
  });

  it('holding pan overrides the tool without changing it', () => {
    const { engine, log } = setup();
    engine.tools.setTool('rect');
    log.length = 0;
    engine.tools.holdPan(true);
    engine.tools.pointerDown(ptr(1, 1));
    expect(log).toEqual(['rect:cancel', 'pan:down:1,1']);
    engine.tools.holdPan(false);
    expect(engine.tools.active.get()).toBe('rect');
    expect(engine.tools.currentId).toBe('rect');
  });

  it('offers keys to the tool first and stops when it handles them', () => {
    const { engine, log } = setup();
    expect(engine.tools.keyDown(key('Enter'))).toBe(true);
    expect(engine.tools.keyDown(key('q'))).toBe(false);
    expect(log).toEqual(['select:key:Enter', 'select:key:q']);
  });
});

describe('AnnotatorEngine', () => {
  it('draws on top and selects what it created', async () => {
    const { engine } = makeEngine();
    const created = await engine.create(rectOf(0, 0, 10, 10));
    expect(created?.createdBy).toBe('alice');
    expect(engine.selection.ids.get()).toEqual([created?.id]);
  });

  it('lets the host veto a new shape', async () => {
    const { engine } = makeEngine();
    engine.hooks.beforeCreate = () => false;
    expect(await engine.create(rectOf(0, 0, 10, 10))).toBeNull();
    expect(engine.store.list.get()).toEqual([]);
  });

  it('asks for a label when one is required, and discards the shape when cancelled', async () => {
    const { engine } = makeEngine({
      requireLabel: true,
      labels: [
        { value: 'tent', color: 'green' },
        { value: 'fire pit', color: 'red' },
      ],
    });
    engine.hooks.pickLabel = vi.fn().mockResolvedValueOnce('fire pit').mockResolvedValueOnce(null);
    const first = await engine.create(rectOf(0, 0, 10, 10));
    expect(first?.bodies).toEqual([{ purpose: 'tagging', value: 'fire pit' }]);
    expect(first?.style?.stroke).toBe('red');
    expect(await engine.create(rectOf(20, 0, 10, 10))).toBeNull();
    expect(engine.store.list.get()).toHaveLength(1);
  });

  it('does not create anything when read-only', async () => {
    const { engine } = makeEngine({ readOnly: true });
    expect(await engine.create(rectOf(0, 0, 10, 10))).toBeNull();
  });

  it('finds the topmost shape under the pointer, skipping hidden ones', () => {
    const { engine } = makeEngine();
    const below = put(engine, rectOf(0, 0, 100, 100));
    const above = put(engine, rectOf(50, 50, 100, 100));
    expect(engine.hit([75, 75])?.id).toBe(above.id);
    expect(engine.hit([10, 10])?.id).toBe(below.id);
    engine.store.update([{ id: above.id, patch: { hidden: true } }]);
    expect(engine.hit([75, 75])?.id).toBe(below.id);
    expect(engine.hit([500, 500])).toBeUndefined();
  });

  it('keeps the pick radius constant on screen when zoomed in', () => {
    const { engine } = makeEngine();
    put(
      engine,
      {
        type: 'polyline',
        points: [
          [0, 0],
          [100, 0],
        ],
      },
      { style: { strokeWidth: 1 } },
    );
    expect(engine.hit([50, 5])).toBeDefined();
    engine.viewport.set({ scale: 4, tx: 0, ty: 0 });
    expect(engine.hit([50, 5])).toBeUndefined();
    expect(engine.hit([50, 1])).toBeDefined();
  });

  it('selects by touching or by containing a rect', () => {
    const { engine } = makeEngine();
    const small = put(engine, rectOf(10, 10, 10, 10));
    const big = put(engine, rectOf(0, 0, 200, 200));
    const marquee = { x: 5, y: 5, w: 30, h: 30 };
    expect(engine.within(marquee, 'touch').map((a) => a.id)).toEqual([small.id, big.id]);
    expect(engine.within(marquee, 'contain').map((a) => a.id)).toEqual([small.id]);
  });

  it('prunes the selection when a shape is deleted, and reports changes', () => {
    const { engine } = makeEngine();
    const seen: string[] = [];
    engine.events.on('changed', (c) =>
      seen.push(`${c.created.length}/${c.updated.length}/${c.deleted.length}`),
    );
    const a = put(engine, rectOf(0, 0, 10, 10));
    engine.selection.set([a.id]);
    engine.update(a.id, { locked: true });
    engine.store.remove([a.id]);
    expect(engine.selection.ids.get()).toEqual([]);
    expect(seen).toEqual(['1/0/0', '0/1/0', '0/0/1']);
  });

  it('does not raise change events for loads', () => {
    const { engine } = makeEngine();
    const spy = vi.fn();
    engine.events.on('changed', spy);
    engine.load([
      {
        id: 'x',
        geometry: rectOf(0, 0, 5, 5),
        bodies: [],
        createdAt: 't',
        updatedAt: 't',
      },
    ]);
    expect(spy).not.toHaveBeenCalled();
    expect(engine.hit([2, 2])?.id).toBe('x');
    expect(engine.history.state.get().canUndo).toBe(false);
  });

  it('skips locked shapes in delete, duplicate and nudge', () => {
    const { engine } = makeEngine();
    const free = put(engine, rectOf(0, 0, 10, 10));
    const locked = put(engine, rectOf(50, 0, 10, 10), { locked: true });
    engine.selection.set([free.id, locked.id]);
    engine.nudgeSelection(5, 0);
    expect(engine.store.get(locked.id)?.geometry).toEqual(locked.geometry);
    expect(engine.store.get(free.id)?.geometry).toMatchObject({ x: 5 });
    engine.deleteSelection();
    expect(engine.store.list.get().map((a) => a.id)).toEqual([locked.id]);
  });

  it('duplicates the selection offset, and selects the copies', () => {
    const { engine } = makeEngine();
    const a = put(engine, rectOf(0, 0, 10, 10), {
      bodies: [{ purpose: 'tagging', value: 'tent' }],
    });
    engine.selection.set([a.id]);
    engine.duplicateSelection();
    const [, copy] = engine.store.list.get();
    expect(copy?.id).not.toBe(a.id);
    expect(copy?.bodies).toEqual(a.bodies);
    expect(copy?.geometry).toMatchObject({ x: 12 });
    expect(engine.selection.ids.get()).toEqual([copy?.id]);
  });

  it('snaps to a nearby vertex and shows an indicator', () => {
    const { engine } = makeEngine();
    put(engine, rectOf(100, 100, 50, 50));
    expect(engine.snap([103, 102])).toEqual([100, 100]);
    expect(engine.snapIndicator.get()).toEqual([100, 100]);
    expect(engine.snap([300, 300])).toEqual([300, 300]);
    expect(engine.snapIndicator.get()).toBeNull();
  });

  it('does not snap when snapping is off', () => {
    const { engine } = makeEngine({ snapping: { enabled: false, tolerancePx: 8 } });
    put(engine, rectOf(100, 100, 50, 50));
    expect(engine.snap([103, 102])).toEqual([103, 102]);
  });

  it('fits an image and limits zooming out to half the fitted scale', () => {
    const { engine } = makeEngine();
    engine.setSurface({ w: 1600, h: 1200 });
    const { scale } = engine.viewport.state.get();
    expect(scale).toBeCloseTo((600 - 32) / 1200);
    expect(engine.viewport.limits.minScale).toBeCloseTo(scale / 2);
    expect(engine.viewport.limits.maxScale).toBe(8);
  });

  it('fits a board to its content, or to a default area when empty', () => {
    const { engine } = makeEngine({}, 'board');
    engine.fit();
    expect(engine.viewport.state.get().scale).toBeGreaterThan(0);
    put(engine, rectOf(0, 0, 100, 50));
    engine.fit();
    expect(engine.viewport.state.get().scale).toBeCloseTo((800 - 96) / 100);
  });

  it('zooms to a point without changing the scale', () => {
    const { engine } = makeEngine();
    const p = put(engine, { type: 'point', x: 400, y: 300 });
    engine.viewport.set({ scale: 2, tx: 0, ty: 0 });
    engine.zoomTo(p.id);
    expect(engine.viewport.state.get().scale).toBe(2);
    expect(engine.viewport.worldToScreen([400, 300])).toEqual([400, 300]);
  });

  it('turns off a tool that the new config no longer offers', () => {
    const { engine } = makeEngine({ tools: ['select', 'rect'] }, 'image', (e) => {
      e.tools.register({ id: 'select', cursor: 'default' });
      e.tools.register({ id: 'rect', cursor: 'crosshair' });
    });
    engine.tools.setTool('rect');
    engine.setConfig({ ...engine.config, tools: ['select'] });
    expect(engine.tools.active.get()).toBe('select');
  });
});

describe('shortcuts', () => {
  const setup = () =>
    makeEngine({ tools: ['select', 'rect', 'ellipse', 'freehand'] }, 'image', (engine) => {
      for (const id of ['select', 'rect', 'ellipse', 'freehand', 'pan'] as const) {
        engine.tools.register({ id, cursor: 'default' });
      }
    });

  it('switches tools with their hotkeys, only when the tool is offered', () => {
    const { engine } = setup();
    expect(handleShortcut(engine, key('r'))).toBe(true);
    expect(engine.tools.active.get()).toBe('rect');
    expect(handleShortcut(engine, key('p'))).toBe(false);
    expect(handleShortcut(engine, key('H'))).toBe(true);
    expect(engine.tools.active.get()).toBe('pan');
  });

  it('undoes and redoes with mod+z and mod+shift+z', async () => {
    const { engine } = setup();
    put(engine, rectOf(0, 0, 10, 10));
    handleShortcut(engine, key('z', { mod: true }));
    await vi.waitFor(() => expect(engine.store.list.get()).toHaveLength(0));
    handleShortcut(engine, key('z', { mod: true, shift: true }));
    await vi.waitFor(() => expect(engine.store.list.get()).toHaveLength(1));
  });

  it('deletes, selects all and duplicates', () => {
    const { engine } = setup();
    put(engine, rectOf(0, 0, 10, 10));
    put(engine, rectOf(20, 0, 10, 10));
    handleShortcut(engine, key('a', { mod: true }));
    expect(engine.selection.ids.get()).toHaveLength(2);
    handleShortcut(engine, key('d', { mod: true }));
    expect(engine.store.list.get()).toHaveLength(4);
    handleShortcut(engine, key('Delete'));
    expect(engine.store.list.get()).toHaveLength(2);
  });

  it('nudges one world pixel, ten with shift, and merges into one undo step', async () => {
    const { engine } = setup();
    const a = put(engine, rectOf(0, 0, 10, 10));
    engine.selection.set([a.id]);
    handleShortcut(engine, key('ArrowRight'));
    handleShortcut(engine, key('ArrowRight', { shift: true }));
    handleShortcut(engine, key('ArrowDown'));
    expect(engine.store.get(a.id)?.geometry).toMatchObject({ x: 11, y: 1 });
    await engine.history.undo();
    expect(engine.store.get(a.id)?.geometry).toMatchObject({ x: 0, y: 0 });
  });

  it('zooms, fits and orders layers', () => {
    const { engine } = setup();
    engine.viewport.setLimits({ minScale: 0.01, maxScale: 100 });
    const before = engine.viewport.state.get().scale;
    handleShortcut(engine, key('+'));
    expect(engine.viewport.state.get().scale).toBeCloseTo(before * 1.25);
    handleShortcut(engine, key('-'));
    expect(engine.viewport.state.get().scale).toBeCloseTo(before);
    const a = put(engine, rectOf(0, 0, 10, 10));
    const b = put(engine, rectOf(20, 0, 10, 10));
    engine.selection.set([a.id]);
    handleShortcut(engine, key(']'));
    expect(engine.store.list.get().map((x) => x.id)).toEqual([b.id, a.id]);
    handleShortcut(engine, key('['));
    expect(engine.store.list.get().map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it('Escape clears the selection, then returns to the select tool', () => {
    const { engine } = setup();
    const a = put(engine, rectOf(0, 0, 10, 10));
    engine.selection.set([a.id]);
    engine.tools.setTool('rect');
    handleShortcut(engine, key('Escape'));
    expect(engine.selection.ids.get()).toEqual([]);
    expect(engine.tools.active.get()).toBe('rect');
    handleShortcut(engine, key('Escape'));
    expect(engine.tools.active.get()).toBe('select');
  });

  it('leaves unknown keys alone', () => {
    const { engine } = setup();
    expect(handleShortcut(engine, key('q'))).toBe(false);
    expect(handleShortcut(engine, key('q', { mod: true }))).toBe(false);
  });
});
