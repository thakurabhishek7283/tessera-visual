import { rectCenter, rotatePoint } from '../geometry/bbox.js';
import type { Geometry, Point } from '../geometry/model.js';
import { type HandleDir, handlePosition, RESIZE_HANDLES } from '../geometry/transform.js';

export interface Handle {
  kind: 'resize' | 'vertex' | 'midpoint' | 'rotate';
  /** World position. */
  at: Point;
  /** `resize` handles: which edges move. */
  dir?: HandleDir;
  /** `vertex`: the vertex. `midpoint`: the vertex before it, so a new vertex goes after this index. */
  index?: number;
  cursor: string;
}

const resizeCursor = (d: HandleDir): string => {
  if (d.sx === 0) return 'ns-resize';
  if (d.sy === 0) return 'ew-resize';
  return d.sx === d.sy ? 'nwse-resize' : 'nesw-resize';
};

/** How far the rotation grip floats above the top edge, in screen pixels. */
export const ROTATE_OFFSET_PX = 26;

/**
 * The grips shown when exactly one shape is selected. `scale` is the current zoom: the rotation
 * grip keeps a fixed distance on screen from the shape.
 */
export function computeHandles(g: Geometry, scale = 1): Handle[] {
  if (g.type === 'rect' || g.type === 'ellipse') {
    const resize = RESIZE_HANDLES.map((dir) => ({
      kind: 'resize' as const,
      at: handlePosition(g, dir),
      dir,
      cursor: resizeCursor(dir),
    }));
    if (g.type !== 'rect') return resize;
    // In the rectangle's own frame the grip sits above the middle of the top edge; rotating that
    // point about the centre puts it where the shape is turned to.
    const above: Point = [g.x + g.w / 2, g.y - ROTATE_OFFSET_PX / scale];
    const away = rotatePoint(above, g.rotation ?? 0, rectCenter(g));
    return [...resize, { kind: 'rotate' as const, at: away, cursor: 'grab' }];
  }
  if (g.type === 'polygon' || g.type === 'polyline') {
    const n = g.points.length;
    const handles: Handle[] = g.points.map((p, index) => ({
      kind: 'vertex' as const,
      at: [p[0], p[1]] as Point,
      index,
      cursor: 'move',
    }));
    const segments = g.type === 'polygon' ? n : n - 1;
    for (let i = 0; i < segments; i++) {
      const a = g.points[i] as Point;
      const b = g.points[(i + 1) % n] as Point;
      handles.push({
        kind: 'midpoint',
        at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        index: i,
        cursor: 'copy',
      });
    }
    return handles;
  }
  return [];
}
