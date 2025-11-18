import { describe, expect, it } from 'vitest';
import { type HitOptions, hitAlong, hitTest } from '../src/geometry/hit.js';
import type { Annotation, Geometry, Point, Style } from '../src/geometry/model.js';

const opts = (over: Partial<HitOptions> = {}): HitOptions => ({
  tolerance: 2,
  scale: 1,
  strokeScales: false,
  ...over,
});

const make = (geometry: Geometry, style?: Style): Annotation => ({
  id: 'a',
  geometry,
  bodies: [],
  ...(style ? { style } : {}),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

type Case = [string, Annotation, Point, boolean];

const rect = (extra: Partial<Extract<Geometry, { type: 'rect' }>> = {}): Geometry => ({
  type: 'rect',
  x: 10,
  y: 10,
  w: 100,
  h: 50,
  ...extra,
});

const cases: Case[] = [
  ['rect: inside, filled by default', make(rect()), [60, 35], true],
  ['rect: inside, fill none', make(rect(), { fill: 'none' }), [60, 35], false],
  ['rect: on the edge with fill none', make(rect(), { fill: 'none' }), [10, 35], true],
  ['rect: just outside within tolerance', make(rect(), { fill: 'none' }), [8, 35], true],
  ['rect: clearly outside', make(rect()), [200, 200], false],
  ['rotated rect: inside after rotation', make(rect({ rotation: 90 })), [60, 70], true],
  ['rotated rect: where it used to be', make(rect({ rotation: 90 })), [20, 35], false],
  [
    'ellipse: centre when filled',
    make({ type: 'ellipse', cx: 50, cy: 50, rx: 40, ry: 20 }),
    [50, 50],
    true,
  ],
  [
    'ellipse: centre when fill none',
    make({ type: 'ellipse', cx: 50, cy: 50, rx: 40, ry: 20 }, { fill: 'none' }),
    [50, 50],
    false,
  ],
  [
    'ellipse: on the outline',
    make({ type: 'ellipse', cx: 50, cy: 50, rx: 40, ry: 20 }, { fill: 'none' }),
    [90, 50],
    true,
  ],
  ['ellipse: outside', make({ type: 'ellipse', cx: 50, cy: 50, rx: 40, ry: 20 }), [90, 80], false],
  [
    'polygon: inside concave notch is outside',
    make({
      type: 'polygon',
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [50, 40],
        [0, 100],
      ],
    }),
    [50, 90],
    false,
  ],
  [
    'polygon: inside an arm',
    make({
      type: 'polygon',
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [50, 40],
        [0, 100],
      ],
    }),
    [10, 30],
    true,
  ],
  [
    'polyline: near a segment',
    make({
      type: 'polyline',
      points: [
        [0, 0],
        [100, 0],
      ],
    }),
    [50, 2],
    true,
  ],
  [
    'polyline: past its end',
    make({
      type: 'polyline',
      points: [
        [0, 0],
        [100, 0],
      ],
    }),
    [130, 0],
    false,
  ],
  [
    'freehand: within half the brush size',
    make(
      {
        type: 'freehand',
        points: [
          [0, 0, 0.5],
          [100, 0, 0.5],
        ],
      },
      { strokeWidth: 10 },
    ),
    [50, 6],
    true,
  ],
  [
    'freehand: beyond the brush',
    make(
      {
        type: 'freehand',
        points: [
          [0, 0, 0.5],
          [100, 0, 0.5],
        ],
      },
      { strokeWidth: 10 },
    ),
    [50, 12],
    false,
  ],
  ['point: close', make({ type: 'point', x: 5, y: 5 }), [8, 5], true],
  ['point: far', make({ type: 'point', x: 5, y: 5 }), [20, 5], false],
  [
    'text: inside the measured box',
    make({ type: 'text', x: 10, y: 10, text: 'hello', fontSize: 10 }),
    [20, 15],
    true,
  ],
  [
    'text: below it',
    make({ type: 'text', x: 10, y: 10, text: 'hello', fontSize: 10 }),
    [20, 60],
    false,
  ],
];

describe('hitTest', () => {
  it.each(cases)('%s', (_name, annotation, point, expected) => {
    expect(hitTest(annotation, point, opts())).toBe(expected);
  });

  it('never hits a hidden annotation', () => {
    expect(hitTest({ ...make(rect()), hidden: true }, [60, 35], opts())).toBe(false);
  });

  it('keeps the screen tolerance constant when zoomed (tolerance is passed in world units)', () => {
    const line = make({
      type: 'polyline',
      points: [
        [0, 0],
        [100, 0],
      ],
    });
    expect(hitTest(line, [50, 3], opts({ tolerance: 8 / 4, scale: 4 }))).toBe(false);
    expect(hitTest(line, [50, 1.5], opts({ tolerance: 8 / 4, scale: 4 }))).toBe(true);
  });

  it('adds half the stroke width: constant on screen in image mode, in the world on a board', () => {
    const line = make(
      {
        type: 'polyline',
        points: [
          [0, 0],
          [100, 0],
        ],
      },
      { strokeWidth: 20 },
    );
    // image mode at scale 10: 20 px stroke is 2 world units wide
    expect(hitTest(line, [50, 4], opts({ tolerance: 0, scale: 10 }))).toBe(false);
    // board mode: the stroke is 20 world units wide
    expect(hitTest(line, [50, 8], opts({ tolerance: 0, scale: 10, strokeScales: true }))).toBe(
      true,
    );
  });
});

describe('hitAlong', () => {
  it('finds a shape the pointer swept across between two samples', () => {
    const a = make({ type: 'point', x: 50, y: 0 });
    expect(hitAlong(a, [0, 0], [100, 0], opts())).toBe(true);
    expect(hitAlong(a, [0, 20], [100, 20], opts())).toBe(false);
  });
});
