import type { ToolId } from '../config.js';
import type { Tool, ToolContext } from '../engine/tools.js';
import { dist } from '../geometry/math.js';
import type { Geometry, Point } from '../geometry/model.js';
import { MIN_DRAG_PX } from './drag-shape.js';

interface PathOptions {
  id: ToolId;
  closed: boolean;
  arrow: boolean;
}

const MIN_POINTS = { open: 2, closed: 3 };

/**
 * Click to add vertices; double-click or Enter finishes. A closed path (polygon) also finishes by
 * clicking its first vertex. An open path (polyline, arrow) can be drawn in one press-drag-release.
 * Backspace removes the last vertex and Escape cancels.
 */
function pathTool({ id, closed, arrow }: PathOptions): Tool {
  let points: Point[] = [];
  let hover: Point | undefined;
  let downScreen: Point | undefined;
  const min = closed ? MIN_POINTS.closed : MIN_POINTS.open;

  const geometry = (pts: Point[]): Geometry | null => {
    if (pts.length < 2) return null;
    if (closed)
      return pts.length >= 3 ? { type: 'polygon', points: pts } : { type: 'polyline', points: pts };
    return { type: 'polyline', points: pts, ...(arrow ? { arrowEnd: true } : {}) };
  };

  const show = (ctx: ToolContext): void => {
    const shown = hover ? [...points, hover] : points;
    ctx.preview(geometry(shown));
  };

  const reset = (ctx: ToolContext): void => {
    points = [];
    hover = undefined;
    downScreen = undefined;
    ctx.preview(null);
    ctx.engine.snapIndicator.set(null);
  };

  const finish = (ctx: ToolContext): void => {
    // A double click lands two presses on the same spot; the second adds a duplicate vertex.
    while (points.length > min - 1 && points.length > 1) {
      const a = points.at(-1) as Point;
      const b = points.at(-2) as Point;
      if (dist(a, b) > ctx.tolerance) break;
      points.pop();
    }
    const done = points;
    reset(ctx);
    if (done.length >= min) {
      const g = closed
        ? ({ type: 'polygon', points: done } as const)
        : ({ type: 'polyline', points: done, ...(arrow ? { arrowEnd: true } : {}) } as const);
      void ctx.commit(g);
    }
  };

  return {
    id,
    cursor: 'crosshair',
    onPointerDown(e, ctx) {
      if (e.button !== 0) return;
      const first = points[0];
      if (closed && first && points.length >= 3 && dist(e.world, first) <= ctx.tolerance * 1.5) {
        finish(ctx);
        return;
      }
      points.push(ctx.snap(e.world));
      downScreen = e.screen;
      hover = undefined;
      show(ctx);
    },
    onPointerMove(e, ctx) {
      if (points.length === 0) {
        ctx.snap(e.world);
        return;
      }
      hover = ctx.snap(e.world);
      show(ctx);
    },
    onPointerUp(e, ctx) {
      // Press-drag-release with a single vertex draws a straight two-point line or arrow.
      if (closed || points.length !== 1 || !downScreen) return;
      const moved = Math.hypot(e.screen[0] - downScreen[0], e.screen[1] - downScreen[1]);
      if (moved < MIN_DRAG_PX) return;
      points.push(ctx.snap(e.world));
      finish(ctx);
    },
    onDoubleClick(_e, ctx) {
      if (points.length > 0) finish(ctx);
    },
    onKeyDown(e, ctx) {
      if (points.length === 0) return false;
      if (e.key === 'Enter') {
        finish(ctx);
        return true;
      }
      if (e.key === 'Backspace') {
        points.pop();
        if (points.length === 0) reset(ctx);
        else show(ctx);
        return true;
      }
      if (e.key === 'Escape') {
        reset(ctx);
        return true;
      }
      return false;
    },
    cancel: reset,
  };
}

export const polygonTool = (): Tool => pathTool({ id: 'polygon', closed: true, arrow: false });
export const polylineTool = (): Tool => pathTool({ id: 'polyline', closed: false, arrow: false });
export const arrowTool = (): Tool => pathTool({ id: 'arrow', closed: false, arrow: true });
