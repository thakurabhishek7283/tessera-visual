import { estimateText, rectCenter, rotatePoint, type TextMeasure } from './bbox.js';
import { dist, distToPath, pointInPolygon } from './math.js';
import { type Annotation, type Geometry, isFilled, type Point } from './model.js';

export const DEFAULT_STROKE_WIDTH = 2;
export const DEFAULT_BRUSH_SIZE = 6;

export interface HitOptions {
  /** Pick radius in world units (`tolerancePx / scale`). */
  tolerance: number;
  /** Current viewport scale. */
  scale: number;
  /** Board mode scales strokes with the world; image mode keeps them at a constant screen size. */
  strokeScales: boolean;
  measure?: TextMeasure;
}

/** Half the painted stroke width in world units. */
export function halfStroke(a: Annotation, o: Pick<HitOptions, 'scale' | 'strokeScales'>): number {
  const width = a.style?.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  return (o.strokeScales ? width : width / o.scale) / 2;
}

/** Distance from the point to the rectangle's outline (zero on it, positive either side). */
function distToRectEdge(p: Point, x: number, y: number, w: number, h: number): number {
  const dx = Math.max(x - p[0], 0, p[0] - (x + w));
  const dy = Math.max(y - p[1], 0, p[1] - (y + h));
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  return Math.min(p[0] - x, x + w - p[0], p[1] - y, y + h - p[1]);
}

/** The shape under the given geometry that was picked, ignoring visibility and locking. */
export function hitGeometry(
  g: Geometry,
  filled: boolean,
  p: Point,
  reach: number,
  o: Pick<HitOptions, 'scale' | 'measure'> & { brush: number },
): boolean {
  switch (g.type) {
    case 'rect': {
      const local = rotatePoint(p, -(g.rotation ?? 0), rectCenter(g));
      const edge = distToRectEdge(local, g.x, g.y, g.w, g.h);
      const inside =
        local[0] >= g.x && local[0] <= g.x + g.w && local[1] >= g.y && local[1] <= g.y + g.h;
      return (filled && inside) || edge <= reach;
    }
    case 'ellipse': {
      if (g.rx === 0 || g.ry === 0) {
        return (
          distToPath(
            p,
            [
              [g.cx - g.rx, g.cy - g.ry],
              [g.cx + g.rx, g.cy + g.ry],
            ],
            false,
          ) <= reach
        );
      }
      const v = Math.hypot((p[0] - g.cx) / g.rx, (p[1] - g.cy) / g.ry);
      if (filled && v <= 1) return true;
      return Math.abs(v - 1) * Math.min(g.rx, g.ry) <= reach;
    }
    case 'polygon':
      return (filled && pointInPolygon(p, g.points)) || distToPath(p, g.points, true) <= reach;
    case 'polyline':
      return distToPath(p, g.points, false) <= reach;
    case 'freehand':
      return distToPath(p, g.points, false) <= o.brush / 2 + reach;
    case 'point':
      return dist(p, [g.x, g.y]) <= Math.max(reach, 6 / o.scale);
    case 'text': {
      const m = (o.measure ?? estimateText)(g);
      return (
        p[0] >= g.x - reach &&
        p[0] <= g.x + m.w + reach &&
        p[1] >= g.y - reach &&
        p[1] <= g.y + m.h + reach
      );
    }
  }
}

/** Precise hit test of one annotation (the broad phase is the spatial index). Hidden ones never hit. */
export function hitTest(a: Annotation, p: Point, o: HitOptions): boolean {
  if (a.hidden) return false;
  // A brush stroke is a filled outline whose width is the brush size, not a stroked path.
  const stroke = a.geometry.type === 'freehand' ? 0 : halfStroke(a, o);
  return hitGeometry(a.geometry, isFilled(a.style), p, o.tolerance + stroke, {
    scale: o.scale,
    brush: a.style?.strokeWidth ?? DEFAULT_BRUSH_SIZE,
    ...(o.measure ? { measure: o.measure } : {}),
  });
}

/** Whether any sample along the path `from`→`to` hits the annotation (used by the eraser). */
export function hitAlong(a: Annotation, from: Point, to: Point, o: HitOptions): boolean {
  const length = dist(from, to);
  const steps = Math.max(1, Math.ceil(length / Math.max(o.tolerance, 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (hitTest(a, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], o)) {
      return true;
    }
  }
  return false;
}
