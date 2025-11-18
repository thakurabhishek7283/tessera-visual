import type { Point } from './model.js';

export const dist = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The point of segment `a`–`b` nearest to `p`, and its parameter along the segment (0–1). */
export function projectOnSegment(p: Point, a: Point, b: Point): { point: Point; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { point: [a[0], a[1]], t: 0 };
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return { point: [a[0] + t * dx, a[1] + t * dy], t };
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  return dist(p, projectOnSegment(p, a, b).point);
}

/** Smallest distance from `p` to a chain of segments (a single point counts as a degenerate chain). */
export function distToPath(
  p: Point,
  points: ReadonlyArray<readonly number[]>,
  closed = false,
): number {
  const at = (i: number): Point => {
    const q = points[i] as readonly number[];
    return [q[0] as number, q[1] as number];
  };
  if (points.length === 1) return dist(p, at(0));
  let best = Number.POSITIVE_INFINITY;
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i++) {
    best = Math.min(best, distToSegment(p, at(i), at((i + 1) % points.length)));
  }
  return best;
}

/** Even–odd ray casting. */
export function pointInPolygon(p: Point, points: ReadonlyArray<readonly number[]>): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i] as readonly [number, number];
    const [xj, yj] = points[j] as readonly [number, number];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
