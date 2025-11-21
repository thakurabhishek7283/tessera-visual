import { createHistory, createIdGenerator, type History } from '@tessera/core';
import { createFakeClock } from '@tessera/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnnotationStore } from '../src/engine/store.js';
import type { Geometry, NewAnnotation } from '../src/geometry/model.js';

const rect = (x: number): NewAnnotation => ({
  geometry: { type: 'rect', x, y: 0, w: 10, h: 10 } satisfies Geometry,
});

let history: History;
let store: AnnotationStore;
let clock: ReturnType<typeof createFakeClock>;

beforeEach(() => {
  clock = createFakeClock(Date.UTC(2026, 0, 1));
  history = createHistory({ clock });
  store = new AnnotationStore({
    clock,
    ids: createIdGenerator({ clock }),
    history,
    user: () => 'alice',
  });
});

const ids = (): string[] => store.list.get().map((a) => a.id);

describe('AnnotationStore', () => {
  it('adds on top with ids, timestamps and the creator filled in', () => {
    const [a] = store.add([rect(0)]);
    expect(a?.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(a?.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(a?.createdBy).toBe('alice');
    expect(store.get(a?.id as string)).toBe(a);
  });

  it('undoes and redoes a create', async () => {
    const [a] = store.add([rect(0)]);
    await history.undo();
    expect(store.list.get()).toEqual([]);
    await history.redo();
    expect(ids()).toEqual([a?.id]);
  });

  it('updates, stamps updatedAt and undoes back to the exact earlier object', async () => {
    const [a] = store.add([rect(0)]);
    clock.advance(1000);
    const [b] = store.update([{ id: a?.id as string, patch: { geometry: rect(50).geometry } }]);
    expect(b?.updatedAt).toBe('2026-01-01T00:00:01.000Z');
    expect(b?.createdAt).toBe(a?.createdAt);
    await history.undo();
    expect(store.get(a?.id as string)).toBe(a);
    await history.redo();
    expect(store.get(a?.id as string)).toBe(b);
  });

  it('deletes and restores shapes at their old positions', async () => {
    const [a, b, c] = store.add([rect(0), rect(20), rect(40)]);
    store.remove([a?.id as string, c?.id as string]);
    expect(ids()).toEqual([b?.id]);
    await history.undo();
    expect(ids()).toEqual([a?.id, b?.id, c?.id]);
    await history.redo();
    expect(ids()).toEqual([b?.id]);
  });

  it('reorders, and undoes the order', async () => {
    const [a, b, c] = store.add([rect(0), rect(20), rect(40)]);
    await history.undo(); // keep the create from piling into the reorder assertions
    await history.redo();
    store.reorder([a?.id as string], 'front');
    expect(ids()).toEqual([b?.id, c?.id, a?.id]);
    store.reorder([a?.id as string], 'backward');
    expect(ids()).toEqual([b?.id, a?.id, c?.id]);
    store.reorder([c?.id as string], 'back');
    expect(ids()).toEqual([c?.id, b?.id, a?.id]);
    await history.undo();
    expect(ids()).toEqual([b?.id, a?.id, c?.id]);
    await history.undo();
    expect(ids()).toEqual([b?.id, c?.id, a?.id]);
    await history.undo();
    expect(ids()).toEqual([a?.id, b?.id, c?.id]);
  });

  it('reports false when a reorder changes nothing', () => {
    const [a] = store.add([rect(0)]);
    expect(store.reorder([a?.id as string], 'front')).toBe(false);
    expect(store.reorder(['missing'], 'front')).toBe(false);
  });

  it('merges consecutive nudges into one undo step', async () => {
    const [a] = store.add([rect(0)]);
    for (let x = 1; x <= 5; x++) {
      store.update([{ id: a?.id as string, patch: { geometry: rect(x).geometry } }], 'Nudge', {
        mergeKey: `nudge:${a?.id}`,
      });
      clock.advance(50);
    }
    await history.undo();
    expect(store.get(a?.id as string)).toBe(a);
    expect(history.state.get().canUndo).toBe(true); // the create is still there
  });

  it('keeps what someone else changed when an update is undone', async () => {
    const [a, b] = store.add([rect(0), rect(20)]);
    store.update([{ id: a?.id as string, patch: { hidden: true } }]);
    // another user edits b and deletes nothing: simulated by loading a changed list
    const edited = { ...(store.get(b?.id as string) as NonNullable<typeof b>), locked: true };
    store.load(store.list.get().map((x) => (x.id === edited.id ? edited : x)));
    await history.undo();
    expect(store.get(a?.id as string)?.hidden).toBeUndefined();
    expect(store.get(b?.id as string)?.locked).toBe(true);
  });

  it('does not bring back a shape another user deleted when an update is undone', async () => {
    const [a] = store.add([rect(0)]);
    store.update([{ id: a?.id as string, patch: { hidden: true } }]);
    store.load([]);
    await history.undo();
    expect(store.list.get()).toEqual([]);
  });

  it('ignores updates and removals of unknown ids', () => {
    expect(store.update([{ id: 'nope', patch: { hidden: true } }])).toEqual([]);
    expect(store.remove(['nope'])).toEqual([]);
    expect(history.state.get().canUndo).toBe(false);
  });
});
