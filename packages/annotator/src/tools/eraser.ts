import type { Tool, ToolContext } from '../engine/tools.js';
import { hitAlong } from '../geometry/hit.js';
import type { Point } from '../geometry/model.js';

/** Drag over shapes to mark them (dimmed), release to delete them all as one undo step. */
export function eraserTool(): Tool {
  let last: Point | undefined;
  const marked = new Set<string>();

  const reset = (ctx: ToolContext): void => {
    last = undefined;
    marked.clear();
    ctx.engine.erasing.set([]);
  };

  const sweep = (to: Point, ctx: ToolContext): void => {
    const { engine } = ctx;
    const from = last ?? to;
    const options = engine.hitOptions();
    const around = engine.within(
      {
        x: Math.min(from[0], to[0]) - options.tolerance,
        y: Math.min(from[1], to[1]) - options.tolerance,
        w: Math.abs(to[0] - from[0]) + options.tolerance * 2,
        h: Math.abs(to[1] - from[1]) + options.tolerance * 2,
      },
      'touch',
    );
    let added = false;
    for (const a of around) {
      if (a.locked || marked.has(a.id)) continue;
      if (hitAlong(a, from, to, options)) {
        marked.add(a.id);
        added = true;
      }
    }
    last = to;
    if (added) engine.erasing.set([...marked]);
  };

  return {
    id: 'eraser',
    cursor: 'cell',
    onPointerDown(e, ctx) {
      if (e.button !== 0 || !ctx.engine.canEdit) return;
      last = e.world;
      sweep(e.world, ctx);
    },
    onPointerMove(e, ctx) {
      if (last) sweep(e.world, ctx);
    },
    onPointerUp(_e, ctx) {
      const doomed = [...marked];
      reset(ctx);
      if (doomed.length > 0) ctx.engine.store.remove(doomed, 'Erase');
    },
    onKeyDown(e, ctx) {
      if (e.key !== 'Escape' || !last) return false;
      reset(ctx);
      return true;
    },
    cancel: reset,
  };
}
