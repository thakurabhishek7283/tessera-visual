import { describe, expect, it } from 'vitest';
import {
  bboxOf,
  expandRect,
  rectContains,
  rectCorners,
  rectsIntersect,
  rotatePoint,
  unionRect,
} from '../src/geometry/bbox.js';
import type { Geometry } from '../src/geometry/model.js';
import { AnnotationSchema, GeometrySchema } from '../src/geometry/model.js';

const close = (a: number, b: number): void => expect(a).toBeCloseTo(b, 6);

describe('bboxOf', () => {
  const cases: Array<[string, Geometry, { x: number; y: number; w: number; h: number }]> = [
    ['rect', { type: 'rect', x: 10, y: 20, w: 30, h: 40 }, { x: 10, y: 20, w: 30, h: 40 }],
    [
      'ellipse',
      { type: 'ellipse', cx: 50, cy: 50, rx: 10, ry: 20 },
      { x: 40, y: 30, w: 20, h: 40 },
    ],
    [
      'polygon',
      {
        type: 'polygon',
        points: [
          [0, 0],
          [10, 5],
          [4, 12],
        ],
      },
      { x: 0, y: 0, w: 10, h: 12 },
    ],
    [
      'polyline',
      {
        type: 'polyline',
        points: [
          [-5, 2],
          [5, -3],
        ],
      },
      { x: -5, y: -3, w: 10, h: 5 },
    ],
    [
      'freehand',
      {
        type: 'freehand',
        points: [
          [1, 1, 0.5],
          [9, 3, 0.5],
        ],
      },
      { x: 1, y: 1, w: 8, h: 2 },
    ],
    ['point', { type: 'point', x: 7, y: 8 }, { x: 7, y: 8, w: 0, h: 0 }],
  ];
  it.each(cases)('%s', (_name, geometry, expected) => {
    expect(bboxOf(geometry)).toEqual(expected);
  });

  it('measures text with the given measurer, and estimates without one', () => {
    const g: Geometry = { type: 'text', x: 5, y: 6, text: 'ab\nabcd', fontSize: 10 };
    expect(bboxOf(g, () => ({ w: 33, h: 44 }))).toEqual({ x: 5, y: 6, w: 33, h: 44 });
    const estimated = bboxOf(g);
    expect(estimated.w).toBeCloseTo(24);
    expect(estimated.h).toBeCloseTo(25);
  });

  it('covers a rotated rect by its rotated corners', () => {
    const box = bboxOf({ type: 'rect', x: 0, y: 0, w: 20, h: 10, rotation: 90 });
    close(box.w, 10);
    close(box.h, 20);
    close(box.x + box.w / 2, 10);
    close(box.y + box.h / 2, 5);
  });
});

describe('helpers', () => {
  it('rotates around a point', () => {
    const [x, y] = rotatePoint([2, 0], 90, [1, 0]);
    close(x, 1);
    close(y, 1);
  });

  it('lists rotated corners clockwise from the top left', () => {
    const corners = rectCorners({ x: 0, y: 0, w: 2, h: 2, rotation: 0 });
    expect(corners[0]).toEqual([0, 0]);
    expect(corners[2]).toEqual([2, 2]);
  });

  it('unions, intersects, contains and expands rects', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 5, y: 5, w: 10, h: 10 };
    expect(unionRect(a, b)).toEqual({ x: 0, y: 0, w: 15, h: 15 });
    expect(rectsIntersect(a, b)).toBe(true);
    expect(rectsIntersect(a, { x: 11, y: 0, w: 1, h: 1 })).toBe(false);
    expect(rectContains(unionRect(a, b), a)).toBe(true);
    expect(rectContains(a, b)).toBe(false);
    expect(expandRect(a, 2)).toEqual({ x: -2, y: -2, w: 14, h: 14 });
  });
});

describe('schemas', () => {
  it('rejects polygons with fewer than three points and non-finite numbers', () => {
    expect(
      GeometrySchema.safeParse({
        type: 'polygon',
        points: [
          [0, 0],
          [1, 1],
        ],
      }).success,
    ).toBe(false);
    expect(GeometrySchema.safeParse({ type: 'point', x: Number.NaN, y: 0 }).success).toBe(false);
  });

  it('parses a full annotation', () => {
    const parsed = AnnotationSchema.safeParse({
      id: 'a',
      geometry: { type: 'rect', x: 0, y: 0, w: 1, h: 1 },
      bodies: [{ purpose: 'tagging', value: 'tent' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.success).toBe(true);
  });
});
