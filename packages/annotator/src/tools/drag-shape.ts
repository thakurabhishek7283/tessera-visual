import type { ToolId } from '../config.js';
import type { NormalizedPointer, Tool, ToolContext } from '../engine/tools.js';
import { rectFromPoints } from '../geometry/bbox.js';
import type { Geometry, Point, Rect } from '../geometry/model.js';

/** Pointer moves under this many screen pixels are a click, not a drag. */
export const MIN_DRAG_PX = 3;

/** The box dragged out from `start` to `end`: shift makes it square, alt grows it from the centre. */
export function dragBox(start: Point, end: Point, shift: boolean, alt: boolean): Rect {
  let dx = end[0] - start[0];
  let dy = end[1] - start[1];
  if (shift) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (Math.sign(dx) || 1) * side;
    dy = (Math.sign(dy) || 1) * side;
  }
  if (alt) return rectFromPoints([start[0] - dx, start[1] - dy], [start[0] + dx, start[1] + dy]);
  return rectFromPoints(start, [start[0] + dx, start[1] + dy]);
}

/** A tool that drags a box and turns it into a geometry (rect, ellipse). */
export function dragShapeTool(id: ToolId, toGeometry: (box: Rect) => Geometry): Tool {
  let start: Point | undefined;
  let startScreen: Point | undefined;
  let last: Geometry | undefined;

  const reset = (ctx: ToolContext): void => {
    start = undefined;
    startScreen = undefined;
    last = undefined;
    ctx.preview(null);
    ctx.engine.snapIndicator.set(null);
  };

  const update = (e: NormalizedPointer, ctx: ToolContext): void => {
    if (!start) return;
    const end = ctx.snap(e.world);
    last = toGeometry(dragBox(start, end, e.shift, e.alt));
    ctx.preview(last);
  };

  return {
    id,
    cursor: 'crosshair',
    onPointerDown(e, ctx) {
      if (e.button !== 0) return;
      start = ctx.snap(e.world);
      startScreen = e.screen;
      last = undefined;
    },
    onPointerMove(e, ctx) {
      if (!start) {
        ctx.snap(e.world);
        return;
      }
      update(e, ctx);
    },
    onPointerUp(e, ctx) {
      if (!start || !startScreen) return;
      const moved = Math.hypot(e.screen[0] - startScreen[0], e.screen[1] - startScreen[1]);
      update(e, ctx);
      const done = last;
      reset(ctx);
      if (done && moved >= MIN_DRAG_PX) void ctx.commit(done);
    },
    onKeyDown(e, ctx) {
      if (e.key !== 'Escape' || !start) return false;
      reset(ctx);
      return true;
    },
    cancel: reset,
  };
}

export const rectTool = (): Tool =>
  dragShapeTool('rect', (b) => ({ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }));

export const ellipseTool = (): Tool =>
  dragShapeTool('ellipse', (b) => ({
    type: 'ellipse',
    cx: b.x + b.w / 2,
    cy: b.y + b.h / 2,
    rx: b.w / 2,
    ry: b.h / 2,
  }));
