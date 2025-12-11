import perfectFreehand from 'perfect-freehand';
import { LINE_HEIGHT } from '../geometry/bbox.js';
import { DEFAULT_BRUSH_SIZE, DEFAULT_STROKE_WIDTH } from '../geometry/hit.js';
import type { Annotation, Geometry, Point } from '../geometry/model.js';
import { resolveColor } from './color.js';

/** A description of one SVG element: the renderer builds DOM from it, export builds markup. */
export interface SvgNode {
  tag: 'rect' | 'ellipse' | 'polygon' | 'polyline' | 'path' | 'text' | 'tspan';
  attrs: Record<string, string | number>;
  /** CSS properties; colours are already resolved. */
  style: Record<string, string | number>;
  text?: string;
  children?: SvgNode[];
}

export interface ShapeOptions {
  /** Board strokes scale with the world; image strokes keep a constant width on screen. */
  strokeScales: boolean;
  /** Replaces palette-name resolution (export needs concrete colours). */
  color?: (value: string | undefined) => string;
}

const f = (n: number): string => String(Math.round(n * 100) / 100);
const list = (points: ReadonlyArray<readonly number[]>): string =>
  points.map((p) => `${f(p[0] as number)},${f(p[1] as number)}`).join(' ');

/** Outline of a brush stroke as an SVG path (perfect-freehand's recommended smoothing). */
export function freehandPath(
  points: ReadonlyArray<readonly [number, number, number]>,
  size: number,
  brush: { thinning: number; smoothing: number; streamline: number } = {
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  },
): string {
  const simulate = points.every((p) => p[2] === 0.5);
  const outline = perfectFreehand(
    points.map((p) => [p[0], p[1], p[2]] as [number, number, number]),
    { size, ...brush, simulatePressure: simulate, last: true },
  );
  if (outline.length < 4) {
    // A tap draws a dot.
    const [x, y] = (points[0] ?? [0, 0]) as readonly number[];
    const r = size / 2;
    return `M${f((x as number) - r)},${f(y as number)}a${f(r)},${f(r)} 0 1,0 ${f(size)},0a${f(r)},${f(r)} 0 1,0 ${f(-size)},0`;
  }
  const d = outline.reduce<Array<string | number>>(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length] as [number, number];
      acc.push(
        f(x0 as number),
        f(y0 as number),
        f(((x0 as number) + x1) / 2),
        f(((y0 as number) + y1) / 2),
      );
      return acc;
    },
    ['M', f(outline[0]?.[0] as number), f(outline[0]?.[1] as number), 'Q'],
  );
  d.push('Z');
  return d.join(' ');
}

/** Corners of an arrow head at `tip`, pointing along `from → tip`. */
export function arrowHead(from: Point, tip: Point, size: number): Point[] {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const spread = Math.PI / 7;
  return [
    [tip[0] - size * Math.cos(angle - spread), tip[1] - size * Math.sin(angle - spread)],
    tip,
    [tip[0] - size * Math.cos(angle + spread), tip[1] - size * Math.sin(angle + spread)],
  ];
}

/** Everything needed to paint an annotation's geometry. */
export function describeShape(a: Annotation, opts: ShapeOptions): SvgNode[] {
  const color = opts.color ?? ((v: string | undefined) => resolveColor(v));
  const style = a.style ?? {};
  const stroke = color(style.stroke);
  const width = style.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  const common: SvgNode['style'] = {
    stroke,
    'stroke-width': width,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
    ...(opts.strokeScales ? {} : { 'vector-effect': 'non-scaling-stroke' }),
    ...(style.opacity !== undefined ? { opacity: style.opacity } : {}),
  };
  const closed: SvgNode['style'] = {
    ...common,
    fill: style.fill === 'none' ? 'none' : color(style.fill ?? style.stroke),
    // An explicit fill is a deliberate choice and is stronger than the default wash.
    'fill-opacity': style.fill === undefined ? 0.12 : 0.3,
  };
  const g: Geometry = a.geometry;
  switch (g.type) {
    case 'rect': {
      const rotate = g.rotation
        ? { transform: `rotate(${f(g.rotation)} ${f(g.x + g.w / 2)} ${f(g.y + g.h / 2)})` }
        : {};
      return [
        {
          tag: 'rect',
          attrs: { x: f(g.x), y: f(g.y), width: f(g.w), height: f(g.h), ...rotate },
          style: closed,
        },
      ];
    }
    case 'ellipse':
      return [
        {
          tag: 'ellipse',
          attrs: { cx: f(g.cx), cy: f(g.cy), rx: f(g.rx), ry: f(g.ry) },
          style: closed,
        },
      ];
    case 'polygon':
      return [{ tag: 'polygon', attrs: { points: list(g.points) }, style: closed }];
    case 'polyline': {
      const nodes: SvgNode[] = [
        { tag: 'polyline', attrs: { points: list(g.points) }, style: { ...common, fill: 'none' } },
      ];
      // Heads are part of the shape and scale with it.
      const head = Math.max(10, width * 4);
      const first = g.points[0] as Point;
      const second = g.points[1] as Point;
      const last = g.points[g.points.length - 1] as Point;
      const beforeLast = g.points[g.points.length - 2] as Point;
      if (g.arrowEnd) {
        nodes.push({
          tag: 'polyline',
          attrs: { points: list(arrowHead(beforeLast, last, head)) },
          style: { ...common, fill: 'none' },
        });
      }
      if (g.arrowStart) {
        nodes.push({
          tag: 'polyline',
          attrs: { points: list(arrowHead(second, first, head)) },
          style: { ...common, fill: 'none' },
        });
      }
      return nodes;
    }
    case 'freehand':
      return [
        {
          tag: 'path',
          attrs: { d: freehandPath(g.points, style.strokeWidth ?? DEFAULT_BRUSH_SIZE) },
          style: {
            fill: stroke,
            stroke: 'none',
            ...(style.opacity !== undefined ? { opacity: style.opacity } : {}),
          },
        },
      ];
    case 'point':
      // A zero-length line with round caps is a dot of constant on-screen size.
      return [
        {
          tag: 'path',
          attrs: { d: `M${f(g.x)},${f(g.y)}h0` },
          style: { ...common, 'stroke-width': Math.max(width, 1) * 5 },
        },
      ];
    case 'text': {
      const lines = g.text.split('\n');
      return [
        {
          tag: 'text',
          attrs: { x: f(g.x), y: f(g.y), 'font-size': f(g.fontSize) },
          style: {
            fill: stroke,
            'dominant-baseline': 'text-before-edge',
            'font-family': 'var(--tessera-font-family, system-ui, sans-serif)',
            ...(style.opacity !== undefined ? { opacity: style.opacity } : {}),
          },
          children: lines.map((line, i) => ({
            tag: 'tspan' as const,
            attrs: { x: f(g.x), ...(i === 0 ? {} : { dy: `${LINE_HEIGHT}em` }) },
            style: {},
            text: line === '' ? ' ' : line,
          })),
        },
      ];
    }
  }
}
