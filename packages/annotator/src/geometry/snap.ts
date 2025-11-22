import { rectCorners } from './bbox.js';
import { dist, projectOnSegment } from './math.js';
import type { Annotation, Point } from './model.js';

export interface SnapResult {
  point: Point;
  kind: 'vertex' | 'edge';
  annotationId: string;
}

interface Candidates {
  vertices: Point[];
  segments: Array<[Point, Point]>;
}

function chain(points: ReadonlyArray<readonly number[]>, closed: boolean): Array<[Point, Point]> {
  const at = (i: number): Point => {
    const q = points[i % points.length] as readonly number[];
    return [q[0] as number, q[1] as number];
  };
  const out: Array<[Point, Point]> = [];
  for (let i = 0; i < (closed ? points.length : points.length - 1); i++)
    out.push([at(i), at(i + 1)]);
  return out;
}

/** The vertices and edges other shapes offer to snap to. Brush strokes and text offer nothing. */
export function snapCandidates(a: Annotation): Candidates {
  const g = a.geometry;
  switch (g.type) {
    case 'rect': {
      const corners = rectCorners(g);
      return { vertices: [...corners], segments: chain(corners, true) };
    }
    case 'ellipse':
      return {
        vertices: [
          [g.cx, g.cy],
          [g.cx - g.rx, g.cy],
          [g.cx + g.rx, g.cy],
          [g.cx, g.cy - g.ry],
          [g.cx, g.cy + g.ry],
        ],
        segments: [],
      };
    case 'polygon':
      return {
        vertices: g.points.map((p) => [p[0], p[1]] as Point),
        segments: chain(g.points, true),
      };
    case 'polyline':
      return {
        vertices: g.points.map((p) => [p[0], p[1]] as Point),
        segments: chain(g.points, false),
      };
    case 'point':
      return { vertices: [[g.x, g.y]], segments: [] };
    case 'freehand':
    case 'text':
      return { vertices: [], segments: [] };
  }
}

/**
 * Finds what `p` should snap to: the nearest vertex within `tolerance`, otherwise the nearest
 * point on an edge within `tolerance`. Vertices win over edges so corners are easy to hit.
 */
export function snapPoint(
  p: Point,
  annotations: readonly Annotation[],
  tolerance: number,
  excludeId?: string,
): SnapResult | null {
  let vertex: SnapResult | null = null;
  let vertexDist = tolerance;
  let edge: SnapResult | null = null;
  let edgeDist = tolerance;
  for (const a of annotations) {
    if (a.id === excludeId || a.hidden) continue;
    const { vertices, segments } = snapCandidates(a);
    for (const v of vertices) {
      const d = dist(p, v);
      if (d <= vertexDist) {
        vertexDist = d;
        vertex = { point: v, kind: 'vertex', annotationId: a.id };
      }
    }
    for (const [s, e] of segments) {
      const { point } = projectOnSegment(p, s, e);
      const d = dist(p, point);
      if (d <= edgeDist) {
        edgeDist = d;
        edge = { point, kind: 'edge', annotationId: a.id };
      }
    }
  }
  return vertex ?? edge;
}
