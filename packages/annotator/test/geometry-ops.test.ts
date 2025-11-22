import { describe, expect, it } from 'vitest';
import {
  distToPath,
  distToSegment,
  pointInPolygon,
  projectOnSegment,
} from '../src/geometry/math.js';
import type { Annotation, Point } from '../src/geometry/model.js';
import { simplify } from '../src/geometry/simplify.js';
import { snapPoint } from '../src/geometry/snap.js';

const make = (id: string, geometry: Annotation['geometry']): Annotation => ({
  id,
  geometry,
  bodies: [],
  createdAt: 't',
  updatedAt: 't',
});

describe('math', () => {
  it('projects onto a segment and clamps at its ends', () => {
    expect(projectOnSegment([5, 3], [0, 0], [10, 0])).toEqual({ point: [5, 0], t: 0.5 });
    expect(projectOnSegment([-4, 3], [0, 0], [10, 0]).point).toEqual([0, 0]);
    expect(distToSegment([13, 4], [0, 0], [10, 0])).toBe(5);
  });

  it('measures distance to a chain, open or closed', () => {
    const square: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(distToPath([5, 12], square, true)).toBe(2);
    expect(distToPath([0, 5], square, false)).toBe(5);
    expect(distToPath([3, 4], [[0, 0]], false)).toBe(5);
  });

  it('uses the even–odd rule', () => {
    const ring: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(pointInPolygon([5, 5], ring)).toBe(true);
    expect(pointInPolygon([15, 5], ring)).toBe(false);
  });
});

describe('simplify (Ramer–Douglas–Peucker)', () => {
  it('drops points on a straight line and keeps the corner', () => {
    const line: Array<[number, number, number]> = [];
    for (let x = 0; x <= 10; x++) line.push([x, 0, 0.5]);
    for (let y = 1; y <= 10; y++) line.push([10, y, 0.5]);
    const out = simplify(line, 0.1);
    expect(out).toEqual([
      [0, 0, 0.5],
      [10, 0, 0.5],
      [10, 10, 0.5],
    ]);
  });

  it('keeps the pressure of the points it keeps', () => {
    const out = simplify(
      [
        [0, 0, 0.1],
        [5, 5, 0.9],
        [10, 0, 0.2],
      ],
      1,
    );
    expect(out[1]).toEqual([5, 5, 0.9]);
  });

  it('does not overflow the stack on a 20 000 point stroke', () => {
    const wave = Array.from({ length: 20_000 }, (_, i): [number, number] => [
      i,
      Math.sin(i / 50) * 40,
    ]);
    const out = simplify(wave, 0.5);
    expect(out.length).toBeLessThan(wave.length);
    expect(out[0]).toEqual(wave[0]);
    expect(out.at(-1)).toEqual(wave.at(-1));
  });

  it('returns short inputs unchanged', () => {
    expect(
      simplify(
        [
          [0, 0],
          [1, 1],
        ],
        5,
      ),
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
});

describe('snapPoint', () => {
  const box = make('box', { type: 'rect', x: 0, y: 0, w: 100, h: 100 });
  const line = make('line', {
    type: 'polyline',
    points: [
      [200, 0],
      [300, 0],
    ],
  });

  it('prefers a vertex over an edge', () => {
    const hit = snapPoint([3, 2], [box], 8);
    expect(hit).toEqual({ point: [0, 0], kind: 'vertex', annotationId: 'box' });
  });

  it('falls back to the nearest point on an edge', () => {
    const hit = snapPoint([50, 4], [box], 8);
    expect(hit?.kind).toBe('edge');
    expect(hit?.point).toEqual([50, 0]);
  });

  it('returns null outside the tolerance and skips the excluded and hidden shapes', () => {
    expect(snapPoint([50, 40], [box], 8)).toBeNull();
    expect(snapPoint([3, 2], [box], 8, 'box')).toBeNull();
    expect(snapPoint([3, 2], [{ ...box, hidden: true }], 8)).toBeNull();
  });

  it('picks the closest candidate among shapes', () => {
    expect(snapPoint([203, 1], [box, line], 8)?.annotationId).toBe('line');
  });
});
