import type { Tool, ToolContext } from '../engine/tools.js';
import { rectFromPoints } from '../geometry/bbox.js';
import { dist } from '../geometry/math.js';
import type { Annotation, Geometry, Point } from '../geometry/model.js';
import {
  insertVertex,
  moveVertex,
  removeVertex,
  resizeEllipse,
  resizeRect,
  translate,
} from '../geometry/transform.js';
import { MIN_DRAG_PX } from './drag-shape.js';
import { computeHandles, type Handle } from './handles.js';

const HANDLE_REACH_PX = 9;

type Mode =
  | { kind: 'move'; origin: Point; targets: Annotation[] }
  | { kind: 'resize'; target: Annotation; handle: Handle }
  | { kind: 'vertex'; target: Annotation; index: number }
  | { kind: 'marquee'; origin: Point; additive: boolean }
  | { kind: 'click' };

/**
 * Select, move, resize and edit shapes. Dragging only changes a draft the renderer shows; the
 * stored shapes change once, on release, as a single undo step.
 */
export function selectTool(): Tool {
  let mode: Mode | undefined;
  let downScreen: Point | undefined;
  let moved = false;

  const clear = (ctx: ToolContext): void => {
    mode = undefined;
    downScreen = undefined;
    moved = false;
    ctx.engine.drafts.set(new Map());
    ctx.engine.marquee.set(null);
    ctx.engine.snapIndicator.set(null);
  };

  /** The grip under the pointer, for the one selected shape that has grips. */
  const handleAt = (
    screen: Point,
    ctx: ToolContext,
  ): { target: Annotation; handle: Handle } | undefined => {
    const { engine } = ctx;
    const ids = engine.selection.ids.get();
    if (ids.length !== 1 || !engine.canEdit) return undefined;
    const target = engine.store.get(ids[0] as string);
    if (!target || target.locked || target.hidden) return undefined;
    let best: { handle: Handle; d: number } | undefined;
    for (const handle of computeHandles(engine.effective(target).geometry)) {
      const d = dist(engine.viewport.worldToScreen(handle.at), screen);
      // Vertices win over midpoints when both are within reach.
      const weight = handle.kind === 'midpoint' ? d + 3 : d;
      if (d <= HANDLE_REACH_PX && (!best || weight < best.d)) best = { handle, d: weight };
    }
    return best ? { target, handle: best.handle } : undefined;
  };

  const setDraft = (ctx: ToolContext, entries: Array<[string, Geometry]>): void => {
    ctx.engine.drafts.set(new Map(entries));
  };

  return {
    id: 'select',
    cursor: 'default',

    onPointerDown(e, ctx) {
      const { engine } = ctx;
      if (e.button !== 0) return;
      downScreen = e.screen;
      moved = false;

      const grip = handleAt(e.screen, ctx);
      if (grip) {
        const { target, handle } = grip;
        if (handle.kind === 'resize') {
          mode = { kind: 'resize', target, handle };
        } else if (handle.kind === 'vertex') {
          const g = target.geometry;
          if (e.alt && (g.type === 'polygon' || g.type === 'polyline')) {
            const reduced = removeVertex(g, handle.index ?? 0);
            if (reduced)
              engine.store.update(
                [{ id: target.id, patch: { geometry: reduced } }],
                'Delete vertex',
              );
            mode = { kind: 'click' };
          } else {
            mode = { kind: 'vertex', target, index: handle.index ?? 0 };
          }
        } else if (target.geometry.type === 'polygon' || target.geometry.type === 'polyline') {
          // A midpoint grip adds a vertex there and drags it straight away.
          const index = (handle.index ?? 0) + 1;
          const grown = insertVertex(target.geometry, handle.index ?? 0, handle.at);
          setDraft(ctx, [[target.id, grown]]);
          mode = { kind: 'vertex', target: { ...target, geometry: grown }, index };
          // Mark the inserted vertex as new so release stores the grown shape even without a drag.
          moved = true;
        }
        return;
      }

      const hit = engine.hit(e.world);
      if (hit) {
        if (e.shift) {
          engine.selection.toggle(hit.id);
          mode = { kind: 'click' };
          return;
        }
        if (!engine.selection.has(hit.id)) engine.selection.set([hit.id]);
        const targets = engine.editableSelection();
        mode = targets.length > 0 ? { kind: 'move', origin: e.world, targets } : { kind: 'click' };
        return;
      }

      if (!e.shift) engine.selection.clear();
      mode = { kind: 'marquee', origin: e.world, additive: e.shift };
    },

    onPointerMove(e, ctx) {
      const { engine } = ctx;
      if (!mode) {
        const grip = handleAt(e.screen, ctx);
        if (grip) ctx.setCursor(grip.handle.cursor);
        else ctx.setCursor(engine.hit(e.world) ? 'move' : 'default');
        return;
      }
      if (!moved && downScreen && dist(e.screen, downScreen) < MIN_DRAG_PX) return;
      moved = true;

      switch (mode.kind) {
        case 'move': {
          const dx = e.world[0] - mode.origin[0];
          const dy = e.world[1] - mode.origin[1];
          setDraft(
            ctx,
            mode.targets.map((a) => [a.id, translate(a.geometry, dx, dy)]),
          );
          break;
        }
        case 'resize': {
          const { target, handle } = mode;
          const g = target.geometry;
          const p = ctx.snap(e.world, target.id);
          if (g.type === 'rect' && handle.dir) {
            setDraft(ctx, [[target.id, resizeRect(g, handle.dir, p, e.shift)]]);
          } else if (g.type === 'ellipse' && handle.dir) {
            setDraft(ctx, [[target.id, resizeEllipse(g, handle.dir, p, e.shift)]]);
          }
          break;
        }
        case 'vertex': {
          const { target, index } = mode;
          const g = target.geometry;
          if (g.type === 'polygon' || g.type === 'polyline') {
            setDraft(ctx, [[target.id, moveVertex(g, index, ctx.snap(e.world, target.id))]]);
          }
          break;
        }
        case 'marquee':
          engine.marquee.set(rectFromPoints(mode.origin, e.world));
          break;
        case 'click':
          break;
      }
    },

    onPointerUp(e, ctx) {
      const { engine } = ctx;
      const current = mode;
      const drafts = engine.drafts.get();
      const wasMoved = moved;
      const alt = e.alt;
      clear(ctx);
      if (!current) return;

      if (current.kind === 'marquee') {
        if (!wasMoved) return;
        const box = rectFromPoints(current.origin, e.world);
        const inside = engine.within(box, alt ? 'contain' : 'touch').map((a) => a.id);
        engine.selection.set(
          current.additive ? [...engine.selection.ids.get(), ...inside] : inside,
        );
        return;
      }
      if (current.kind === 'click' || !wasMoved || drafts.size === 0) return;
      const label =
        current.kind === 'move' ? 'Move' : current.kind === 'resize' ? 'Resize' : 'Edit vertex';
      engine.store.update(
        [...drafts].map(([id, geometry]) => ({ id, patch: { geometry } })),
        label,
      );
    },

    onDoubleClick(e, ctx) {
      const { engine } = ctx;
      const hit = engine.hit(e.world);
      if (hit?.geometry.type === 'text') void engine.editText(hit.id);
    },

    cancel: clear,
  };
}
