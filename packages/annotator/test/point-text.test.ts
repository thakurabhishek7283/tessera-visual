import { describe, expect, it, vi } from 'vitest';
import type { Geometry } from '../src/geometry/model.js';
import { click, put, rectOf, toolEngine } from './helpers.js';

const geometries = (engine: ReturnType<typeof toolEngine>['engine']): Geometry[] =>
  engine.store.list.get().map((a) => a.geometry);

describe('point tool', () => {
  it('drops a point, snapping to a nearby vertex', async () => {
    const { engine } = toolEngine();
    put(engine, rectOf(100, 100, 40, 40));
    engine.tools.setTool('point');
    click(engine, 50, 60);
    click(engine, 103, 98);
    await engine.settled();
    expect(geometries(engine).slice(1)).toEqual([
      { type: 'point', x: 50, y: 60 },
      { type: 'point', x: 100, y: 100 },
    ]);
  });
});

describe('text tool', () => {
  it('writes a new text where you click, sized to 16 screen pixels', async () => {
    const { engine } = toolEngine();
    engine.viewport.set({ scale: 2, tx: 0, ty: 0 });
    engine.hooks.editText = vi.fn().mockResolvedValue('Hello');
    engine.tools.setTool('text');
    click(engine, 40, 50);
    await vi.waitFor(() => expect(engine.store.list.get()).toHaveLength(1));
    expect(geometries(engine)[0]).toEqual({
      type: 'text',
      x: 40,
      y: 50,
      text: 'Hello',
      fontSize: 8,
    });
    expect(engine.hooks.editText).toHaveBeenCalledWith({ x: 40, y: 50, fontSize: 8, text: '' });
  });

  it('discards empty or cancelled text', async () => {
    const { engine } = toolEngine();
    engine.hooks.editText = vi.fn().mockResolvedValueOnce('   ').mockResolvedValueOnce(null);
    engine.tools.setTool('text');
    click(engine, 10, 10);
    click(engine, 50, 50);
    await new Promise((r) => setTimeout(r, 10));
    expect(geometries(engine)).toEqual([]);
  });

  it('edits an existing text when clicked, and deletes it when emptied', async () => {
    const { engine } = toolEngine();
    const t = put(engine, { type: 'text', x: 10, y: 10, text: 'old', fontSize: 14 });
    const edit = vi.fn().mockResolvedValueOnce('new').mockResolvedValueOnce('');
    engine.hooks.editText = edit;
    engine.tools.setTool('text');
    click(engine, 15, 15);
    await vi.waitFor(() => expect(engine.store.get(t.id)?.geometry).toMatchObject({ text: 'new' }));
    expect(edit).toHaveBeenCalledWith({ x: 10, y: 10, fontSize: 14, text: 'old' });
    click(engine, 15, 15);
    await vi.waitFor(() => expect(engine.store.list.get()).toHaveLength(0));
  });

  it('does nothing without a text editor or when read-only', async () => {
    const { engine } = toolEngine({ readOnly: true });
    engine.hooks.editText = vi.fn();
    expect(engine.tools.setTool('text')).toBe(false);
  });
});
