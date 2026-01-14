import type { Tool, ToolContext } from '../engine/tools.js';
import type { Geometry, Style } from '../geometry/model.js';
import { simplify } from '../geometry/simplify.js';

type Sample = [number, number, number];

/** Brush size in world units: from the config on an image, from the stroke width on a board. */
function brushSize(ctx: ToolContext): number {
  const { engine } = ctx;
  return engine.mode === 'board'
    ? Math.max(1, (engine.drawStyle.get().strokeWidth ?? 3) * 2)
    : engine.config.freehand.size;
}

/** Press, drag, release. Samples carry pen pressure; the stroke is simplified before it is stored. */
export function freehandTool(): Tool {
  let samples: Sample[] = [];
  let style: Style | undefined;

  const reset = (ctx: ToolContext): void => {
    samples = [];
    style = undefined;
    ctx.preview(null);
  };

  return {
    id: 'freehand',
    cursor: 'crosshair',
    onPointerDown(e, ctx) {
      if (e.button !== 0) return;
      style = { strokeWidth: brushSize(ctx) };
      samples = [[e.world[0], e.world[1], e.pressure]];
      ctx.preview({ type: 'freehand', points: samples }, style);
    },
    onPointerMove(e, ctx) {
      if (samples.length === 0) return;
      const last = samples.at(-1) as Sample;
      // Skip samples closer than a quarter of a screen pixel: they only add noise.
      if (Math.hypot(e.world[0] - last[0], e.world[1] - last[1]) < ctx.tolerance / 24) return;
      samples.push([e.world[0], e.world[1], e.pressure]);
      ctx.preview({ type: 'freehand', points: [...samples] }, style);
    },
    onPointerUp(e, ctx) {
      if (samples.length === 0) return;
      samples.push([e.world[0], e.world[1], e.pressure]);
      // Half a screen pixel is below what the eye can follow.
      const points = simplify(samples, 0.5 / ctx.engine.viewport.state.get().scale);
      const stroke: Geometry = { type: 'freehand', points };
      const applied = style;
      reset(ctx);
      void ctx.commit(stroke, applied);
    },
    onKeyDown(e, ctx) {
      if (e.key !== 'Escape' || samples.length === 0) return false;
      reset(ctx);
      return true;
    },
    cancel: reset,
  };
}
