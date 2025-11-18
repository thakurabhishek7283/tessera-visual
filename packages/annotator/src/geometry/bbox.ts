import type { Geometry, Point, Rect } from './model.js';

/** Measures a text geometry. The renderer replaces the estimate with a real measurement. */
export type TextMeasure = (g: Extract<Geometry, { type: 'text' }>) => { w: number; h: number };

export const LINE_HEIGHT = 1.25;

/** Estimate used until a real measurement exists: good enough for hit testing and the index. */
export const estimateText: TextMeasure = (g) => {
  const lines = g.text.split('\n');
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  return { w: Math.max(longest, 1) * g.fontSize * 0.6, h: lines.length * g.fontSize * LINE_HEIGHT };
};

export function rotatePoint(p: Point, degrees: number, around: Point): Point {
  if (degrees === 0) return [p[0], p[1]];
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p[0] - around[0];
  const dy = p[1] - around[1];
  return [around[0] + dx * cos - dy * sin, around[1] + dx * sin + dy * cos];
}

export function rectCenter(r: Rect): Point {
  return [r.x + r.w / 2, r.y + r.h / 2];
}

/** The four corners of a rect geometry after rotation, clockwise from the top left. */
export function rectCorners(g: {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number | undefined;
}): [Point, Point, Point, Point] {
  const c = rectCenter(g);
  const r = g.rotation ?? 0;
  return [
    rotatePoint([g.x, g.y], r, c),
    rotatePoint([g.x + g.w, g.y], r, c),
    rotatePoint([g.x + g.w, g.y + g.h], r, c),
    rotatePoint([g.x, g.y + g.h], r, c),
  ];
}

export function boundsOfPoints(points: ReadonlyArray<readonly number[]>): Rect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    const x = p[0] as number;
    const y = p[1] as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Bounding box of a geometry, ignoring stroke width. */
export function bboxOf(g: Geometry, measure: TextMeasure = estimateText): Rect {
  switch (g.type) {
    case 'rect':
      return g.rotation ? boundsOfPoints(rectCorners(g)) : { x: g.x, y: g.y, w: g.w, h: g.h };
    case 'ellipse':
      return { x: g.cx - g.rx, y: g.cy - g.ry, w: g.rx * 2, h: g.ry * 2 };
    case 'polygon':
    case 'polyline':
    case 'freehand':
      return boundsOfPoints(g.points);
    case 'point':
      return { x: g.x, y: g.y, w: 0, h: 0 };
    case 'text': {
      const m = measure(g);
      return { x: g.x, y: g.y, w: m.w, h: m.h };
    }
  }
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/** True when `outer` fully contains `inner`. */
export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function expandRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

/** The rect spanned by two corner points, whichever way they were dragged. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    w: Math.abs(a[0] - b[0]),
    h: Math.abs(a[1] - b[1]),
  };
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h;
}
