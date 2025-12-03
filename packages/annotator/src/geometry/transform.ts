import { bboxOf, rectCenter, rotatePoint } from './bbox.js';
import type { Geometry, GeometryOf, Point, Rect } from './model.js';

export function translate(g: Geometry, dx: number, dy: number): Geometry {
  switch (g.type) {
    case 'rect':
    case 'point':
    case 'text':
      return { ...g, x: g.x + dx, y: g.y + dy };
    case 'ellipse':
      return { ...g, cx: g.cx + dx, cy: g.cy + dy };
    case 'polygon':
    case 'polyline':
      return { ...g, points: g.points.map((p): Point => [p[0] + dx, p[1] + dy]) };
    case 'freehand':
      return {
        ...g,
        points: g.points.map((p): [number, number, number] => [p[0] + dx, p[1] + dy, p[2]]),
      };
  }
}

/** Which edges a resize handle drags: -1 left/top, 1 right/bottom, 0 not moved. */
export interface HandleDir {
  sx: -1 | 0 | 1;
  sy: -1 | 0 | 1;
}

/** The eight resize handles, clockwise from the top left. */
export const RESIZE_HANDLES: readonly HandleDir[] = [
  { sx: -1, sy: -1 },
  { sx: 0, sy: -1 },
  { sx: 1, sy: -1 },
  { sx: 1, sy: 0 },
  { sx: 1, sy: 1 },
  { sx: 0, sy: 1 },
  { sx: -1, sy: 1 },
  { sx: -1, sy: 0 },
];

interface Edges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Moves the edges named by `dir` to `p`, optionally keeping the aspect ratio on corner handles. */
function dragEdges(e: Edges, dir: HandleDir, p: Point, keepAspect: boolean): Edges {
  const out = { ...e };
  if (dir.sx === 1) out.right = p[0];
  else if (dir.sx === -1) out.left = p[0];
  if (dir.sy === 1) out.bottom = p[1];
  else if (dir.sy === -1) out.top = p[1];
  const w = e.right - e.left;
  const h = e.bottom - e.top;
  if (keepAspect && dir.sx !== 0 && dir.sy !== 0 && w > 0 && h > 0) {
    const anchorX = dir.sx === 1 ? e.left : e.right;
    const anchorY = dir.sy === 1 ? e.top : e.bottom;
    const sx = Math.abs(p[0] - anchorX) / w;
    const sy = Math.abs(p[1] - anchorY) / h;
    const s = Math.max(sx, sy);
    // Dragging past the anchor flips the shape instead of freezing it.
    const dx = Math.sign(p[0] - anchorX) || dir.sx;
    const dy = Math.sign(p[1] - anchorY) || dir.sy;
    const moved = { x: anchorX + dx * s * w, y: anchorY + dy * s * h };
    if (dir.sx === 1) out.right = moved.x;
    else out.left = moved.x;
    if (dir.sy === 1) out.bottom = moved.y;
    else out.top = moved.y;
  }
  return out;
}

/** Resizes a (possibly rotated) rectangle by dragging a handle; the opposite edge stays put. */
export function resizeRect(
  g: GeometryOf<'rect'>,
  dir: HandleDir,
  pointer: Point,
  keepAspect = false,
): GeometryOf<'rect'> {
  const rotation = g.rotation ?? 0;
  const center = rectCenter(g);
  // Work in the rectangle's own (unrotated) frame, then rotate the new centre back.
  const local = rotatePoint(pointer, -rotation, center);
  const e = dragEdges(
    { left: g.x, right: g.x + g.w, top: g.y, bottom: g.y + g.h },
    dir,
    local,
    keepAspect,
  );
  const w = Math.abs(e.right - e.left);
  const h = Math.abs(e.bottom - e.top);
  const localCenter: Point = [(e.left + e.right) / 2, (e.top + e.bottom) / 2];
  const [cx, cy] = rotatePoint(localCenter, rotation, center);
  return { ...g, x: cx - w / 2, y: cy - h / 2, w, h };
}

export function resizeEllipse(
  g: GeometryOf<'ellipse'>,
  dir: HandleDir,
  pointer: Point,
  keepAspect = false,
): GeometryOf<'ellipse'> {
  const e = dragEdges(
    { left: g.cx - g.rx, right: g.cx + g.rx, top: g.cy - g.ry, bottom: g.cy + g.ry },
    dir,
    pointer,
    keepAspect,
  );
  return {
    ...g,
    cx: (e.left + e.right) / 2,
    cy: (e.top + e.bottom) / 2,
    rx: Math.abs(e.right - e.left) / 2,
    ry: Math.abs(e.bottom - e.top) / 2,
  };
}

/** Where a resize handle sits for a rect or ellipse, in world coordinates. */
export function handlePosition(
  g: GeometryOf<'rect'> | GeometryOf<'ellipse'>,
  dir: HandleDir,
): Point {
  const box: Rect = bboxOfUnrotated(g);
  const local: Point = [box.x + ((dir.sx + 1) / 2) * box.w, box.y + ((dir.sy + 1) / 2) * box.h];
  return g.type === 'rect' && g.rotation ? rotatePoint(local, g.rotation, rectCenter(box)) : local;
}

function bboxOfUnrotated(g: GeometryOf<'rect'> | GeometryOf<'ellipse'>): Rect {
  return g.type === 'rect' ? { x: g.x, y: g.y, w: g.w, h: g.h } : bboxOf(g);
}

type Path = GeometryOf<'polygon'> | GeometryOf<'polyline'>;

const minPoints = (g: Path): number => (g.type === 'polygon' ? 3 : 2);

export function moveVertex<G extends Path>(g: G, index: number, to: Point): G {
  return { ...g, points: g.points.map((p, i): Point => (i === index ? [to[0], to[1]] : p)) };
}

/** Inserts a vertex after `index` (the midpoint handle). */
export function insertVertex<G extends Path>(g: G, index: number, at: Point): G {
  const points = [...g.points];
  points.splice(index + 1, 0, [at[0], at[1]]);
  return { ...g, points };
}

/** Removes a vertex, or returns `null` when the shape would fall below its minimum. */
export function removeVertex<G extends Path>(g: G, index: number): G | null {
  if (g.points.length <= minPoints(g)) return null;
  return { ...g, points: g.points.filter((_, i) => i !== index) };
}
