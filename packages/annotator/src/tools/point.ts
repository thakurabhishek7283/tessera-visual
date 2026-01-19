import type { Tool } from '../engine/tools.js';

/** Click to drop a point. */
export function pointTool(): Tool {
  return {
    id: 'point',
    cursor: 'crosshair',
    onPointerDown(e, ctx) {
      if (e.button !== 0) return;
      const [x, y] = ctx.snap(e.world);
      ctx.engine.snapIndicator.set(null);
      void ctx.commit({ type: 'point', x, y });
    },
    onPointerMove(e, ctx) {
      ctx.snap(e.world);
    },
  };
}
