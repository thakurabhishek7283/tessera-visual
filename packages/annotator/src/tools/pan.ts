import type { Tool } from '../engine/tools.js';
import type { Point } from '../geometry/model.js';

/** Drag to move the view. */
export function panTool(): Tool {
  let last: Point | undefined;
  return {
    id: 'pan',
    cursor: 'grab',
    onPointerDown(e, ctx) {
      last = e.screen;
      ctx.setCursor('grabbing');
    },
    onPointerMove(e, ctx) {
      if (!last) return;
      ctx.engine.viewport.panBy(e.screen[0] - last[0], e.screen[1] - last[1]);
      last = e.screen;
    },
    onPointerUp(_e, ctx) {
      last = undefined;
      ctx.setCursor('grab');
    },
    cancel() {
      last = undefined;
    },
  };
}
