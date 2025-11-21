import { describe, expect, it } from 'vitest';
import { SpatialIndex } from '../src/engine/spatial.js';
import type { Annotation } from '../src/geometry/model.js';

const box = (id: string, x: number, y: number, w = 10, h = 10): Annotation => ({
  id,
  geometry: { type: 'rect', x, y, w, h },
  bodies: [],
  createdAt: 't',
  updatedAt: 't',
});

describe('SpatialIndex', () => {
  it('finds shapes by rect and by point with tolerance', () => {
    const index = new SpatialIndex();
    index.sync([box('a', 0, 0), box('b', 100, 100)]);
    expect(index.search({ x: -5, y: -5, w: 20, h: 20 })).toEqual(['a']);
    expect(index.queryPoint([103, 103], 0)).toEqual(['b']);
    expect(index.queryPoint([115, 105], 4)).toEqual([]);
    expect(index.queryPoint([115, 105], 6)).toEqual(['b']);
  });

  it('updates only what changed, on move, add and remove', () => {
    const index = new SpatialIndex();
    const a = box('a', 0, 0);
    const b = box('b', 100, 100);
    index.sync([a, b]);
    const moved = box('a', 500, 500);
    index.sync([moved, b, box('c', 0, 0)]);
    expect(index.queryPoint([5, 5], 0)).toEqual(['c']);
    expect(index.queryPoint([505, 505], 0)).toEqual(['a']);
    index.sync([moved]);
    expect(index.size).toBe(1);
    expect(index.queryPoint([105, 105], 0)).toEqual([]);
  });

  it('caches boxes per annotation object and rebuilds when the measurer changes', () => {
    const index = new SpatialIndex();
    const text: Annotation = {
      ...box('t', 0, 0),
      geometry: { type: 'text', x: 0, y: 0, text: 'hi', fontSize: 10 },
    };
    index.sync([text]);
    expect(index.bbox(text)).toBe(index.bbox(text));
    const estimated = index.bbox(text).w;
    index.setMeasure(() => ({ w: 500, h: 20 }));
    expect(index.bbox(text).w).toBe(500);
    expect(index.bbox(text).w).not.toBe(estimated);
    expect(index.queryPoint([400, 5], 0)).toEqual(['t']);
  });

  it('bulk loads a large first sync', () => {
    const index = new SpatialIndex();
    index.sync(
      Array.from({ length: 2000 }, (_, i) => box(`n${i}`, (i % 50) * 20, Math.floor(i / 50) * 20)),
    );
    expect(index.size).toBe(2000);
    expect(index.queryPoint([5, 5], 0)).toEqual(['n0']);
  });
});
