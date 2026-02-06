import { createHistory, createIdGenerator } from '@tessera/core';
import { createMemoryStorage } from '@tessera/storage';
import { createFakeClock, type FakeClock } from '@tessera/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnotatorConfig } from '../src/config.js';
import { AnnotatorEngine } from '../src/engine/engine.js';
import type { Annotation, Geometry } from '../src/geometry/model.js';
import {
  mergeSets,
  type SetDocValue,
  SetPersistence,
  setDocId,
  TOMBSTONE_DAYS,
} from '../src/persistence.js';
import { put, rectOf } from './helpers.js';

const T0 = Date.UTC(2026, 5, 1);
const iso = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString();

const ann = (id: string, at: number, extra: Partial<Annotation> = {}): Annotation => ({
  id,
  geometry: rectOf(0, 0, 10, 10),
  bodies: [],
  createdAt: iso(0),
  updatedAt: iso(at),
  ...extra,
});

const doc = (
  annotations: Annotation[],
  deletedIds: Array<{ id: string; at: string }> = [],
): SetDocValue => ({
  source: 's',
  annotations,
  deletedIds,
});

const ids = (d: SetDocValue): string[] => d.annotations.map((a) => a.id);

describe('mergeSets', () => {
  it('takes the union of both sides', () => {
    const merged = mergeSets(doc([ann('a', 0)]), doc([ann('b', 0)]), T0);
    expect(ids(merged).sort()).toEqual(['a', 'b']);
  });

  it('lets the newer edit win, and keeps local on a tie', () => {
    const local = ann('a', 100, { bodies: [{ purpose: 'tagging', value: 'local' }] });
    const remote = ann('a', 200, { bodies: [{ purpose: 'tagging', value: 'remote' }] });
    expect(mergeSets(doc([local]), doc([remote]), T0).annotations[0]?.bodies[0]?.value).toBe(
      'remote',
    );
    expect(mergeSets(doc([remote]), doc([local]), T0).annotations[0]?.bodies[0]?.value).toBe(
      'remote',
    );
    const tie = ann('a', 100, { bodies: [{ purpose: 'tagging', value: 'remote' }] });
    expect(mergeSets(doc([local]), doc([tie]), T0).annotations[0]?.bodies[0]?.value).toBe('local');
  });

  it('applies a deletion that is newer than the last edit', () => {
    const merged = mergeSets(doc([ann('a', 100)]), doc([], [{ id: 'a', at: iso(200) }]), T0 + 1000);
    expect(ids(merged)).toEqual([]);
    expect(merged.deletedIds).toEqual([{ id: 'a', at: iso(200) }]);
  });

  it('lets an edit made after the deletion bring the shape back and void the tombstone', () => {
    const merged = mergeSets(doc([ann('a', 300)]), doc([], [{ id: 'a', at: iso(200) }]), T0 + 1000);
    expect(ids(merged)).toEqual(['a']);
    expect(merged.deletedIds).toEqual([]);
  });

  it('keeps the latest of two tombstones for the same shape', () => {
    const merged = mergeSets(
      doc([], [{ id: 'a', at: iso(100) }]),
      doc([], [{ id: 'a', at: iso(500) }]),
      T0 + 1000,
    );
    expect(merged.deletedIds).toEqual([{ id: 'a', at: iso(500) }]);
  });

  it(`forgets deletions older than ${TOMBSTONE_DAYS} days`, () => {
    const day = 86_400_000;
    const merged = mergeSets(
      doc(
        [],
        [
          { id: 'old', at: iso(0) },
          { id: 'recent', at: iso(20 * day) },
        ],
      ),
      doc([]),
      T0 + 31 * day,
    );
    expect(merged.deletedIds.map((d) => d.id)).toEqual(['recent']);
  });

  it('keeps the remote stacking order and puts local-only shapes on top', () => {
    const merged = mergeSets(
      doc([ann('x', 0), ann('a', 0), ann('b', 0)]),
      doc([ann('b', 0), ann('a', 0)]),
      T0,
    );
    expect(ids(merged)).toEqual(['b', 'a', 'x']);
  });
});

describe('setDocId', () => {
  it('uses a safe explicit id as is, and otherwise a stable hash of the source', () => {
    expect(setDocId('https://x/a.jpg', 'camp-map')).toBe('camp-map');
    const hashed = setDocId('https://x/a.jpg');
    expect(hashed).toMatch(/^src-[0-9a-f]{16}$/);
    expect(setDocId('https://x/a.jpg')).toBe(hashed);
    expect(setDocId('https://x/b.jpg')).not.toBe(hashed);
    expect(setDocId('https://x/a.jpg', 'not safe!')).toMatch(/^src-/);
  });
});

describe('SetPersistence', () => {
  let clock: FakeClock;
  let storage: ReturnType<typeof createMemoryStorage>;
  const logger = {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    clock = createFakeClock(T0);
    storage = createMemoryStorage({ clock });
    logger.warn.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  const open = async (setId = 'camp') => {
    const engine = new AnnotatorEngine({
      mode: 'image',
      config: AnnotatorConfig.parse({ enabled: true }),
      clock,
      ids: createIdGenerator({ clock }),
      history: createHistory({ clock }),
    });
    const persistence = new SetPersistence({
      ctx: { storage: () => storage, logger: logger as never, clock },
      engine,
      source: 'https://x/a.jpg',
      setId,
    });
    await persistence.start();
    return { engine, persistence };
  };

  const stored = async () => (await storage.get<SetDocValue>('annotator.sets', 'camp'))?.data;

  it('saves local changes after the debounce, not before', async () => {
    const { engine } = await open();
    put(engine, rectOf(0, 0, 10, 10));
    await vi.advanceTimersByTimeAsync(499);
    expect(await stored()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2);
    expect((await stored())?.annotations).toHaveLength(1);
  });

  it('collapses a burst of changes into one write', async () => {
    const { engine } = await open();
    const spy = vi.spyOn(storage, 'put');
    for (let i = 0; i < 5; i++) put(engine, rectOf(i, 0, 1, 1));
    await vi.advanceTimersByTimeAsync(600);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('loads an existing set into a new engine without making a history entry', async () => {
    const first = await open();
    put(first.engine, rectOf(0, 0, 10, 10));
    await first.persistence.flush();
    const second = await open();
    expect(second.engine.store.list.get()).toHaveLength(1);
    expect(second.engine.history.state.get().canUndo).toBe(false);
  });

  it('merges when another tab saved first, instead of overwriting it', async () => {
    const a = await open();
    const b = await open();
    put(a.engine, rectOf(0, 0, 10, 10));
    put(b.engine, rectOf(100, 0, 10, 10));
    await a.persistence.flush();
    await b.persistence.flush();
    expect((await stored())?.annotations).toHaveLength(2);
    expect(b.engine.store.list.get()).toHaveLength(2);
    await a.persistence.flush();
  });

  it('propagates a deletion through the tombstone and does not resurrect the shape', async () => {
    const a = await open();
    const [shape] = a.engine.store.add([{ geometry: rectOf(0, 0, 10, 10) }]);
    await a.persistence.flush();
    const b = await open();
    expect(b.engine.store.list.get()).toHaveLength(1);
    clock.advance(1000);
    a.engine.store.remove([shape?.id as string]);
    await a.persistence.flush();
    expect((await stored())?.deletedIds.map((d) => d.id)).toEqual([shape?.id]);
    // b still has the shape and saves something else: the deletion must win the merge.
    clock.advance(1000);
    put(b.engine, rectOf(50, 0, 5, 5));
    await b.persistence.flush();
    expect(b.engine.store.list.get().map((x) => x.id)).not.toContain(shape?.id);
    expect((await stored())?.annotations.map((x) => x.id)).not.toContain(shape?.id);
  });

  it('cancels the tombstone when a delete is undone', async () => {
    const { engine, persistence } = await open();
    const [shape] = engine.store.add([{ geometry: rectOf(0, 0, 10, 10) }]);
    engine.store.remove([shape?.id as string]);
    await engine.history.undo();
    await persistence.flush();
    const data = await stored();
    expect(data?.deletedIds).toEqual([]);
    expect(data?.annotations).toHaveLength(1);
  });

  it('follows live changes made by another tab', async () => {
    const a = await open();
    const b = await open();
    put(a.engine, rectOf(0, 0, 10, 10));
    await a.persistence.flush();
    await vi.waitFor(() => expect(b.engine.store.list.get()).toHaveLength(1));
    expect(b.engine.history.state.get().canUndo).toBe(false);
  });

  it('does not save again just because it merged what was already stored', async () => {
    const a = await open();
    put(a.engine, rectOf(0, 0, 10, 10));
    await a.persistence.flush();
    const spy = vi.spyOn(storage, 'put');
    const b = await open();
    await vi.advanceTimersByTimeAsync(1000);
    expect(b.engine.store.list.get()).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('writes what is pending when it is destroyed', async () => {
    const { engine, persistence } = await open();
    put(engine, rectOf(0, 0, 10, 10));
    await persistence.destroy();
    expect((await stored())?.annotations).toHaveLength(1);
  });

  it('replaces a stored document it cannot read rather than losing local work', async () => {
    await storage.put('annotator.sets', { id: 'camp', data: { nonsense: true } });
    const { engine, persistence } = await open();
    put(engine, rectOf(0, 0, 10, 10));
    await persistence.flush();
    expect((await stored())?.annotations).toHaveLength(1);
  });

  it('keeps the work and warns when storage fails', async () => {
    const { engine, persistence } = await open();
    vi.spyOn(storage, 'put').mockRejectedValueOnce(new Error('disk full'));
    put(engine, rectOf(0, 0, 10, 10));
    await persistence.flush();
    expect(logger.warn).toHaveBeenCalled();
    await persistence.flush();
    expect((await stored())?.annotations).toHaveLength(1);
  });

  it('stops following changes after destroy', async () => {
    const a = await open();
    const b = await open();
    await b.persistence.destroy();
    put(a.engine, rectOf(0, 0, 10, 10));
    await a.persistence.flush();
    await vi.advanceTimersByTimeAsync(100);
    expect(b.engine.store.list.get()).toHaveLength(0);
  });

  it('stores geometry the schema accepts', async () => {
    const { engine, persistence } = await open();
    const shapes: Geometry[] = [
      rectOf(0, 0, 5, 5),
      { type: 'point', x: 1, y: 2 },
      { type: 'text', x: 0, y: 0, text: 'hi', fontSize: 12 },
    ];
    for (const g of shapes) put(engine, g);
    await persistence.flush();
    expect((await stored())?.annotations).toHaveLength(3);
  });
});
