import type { Annotation, Body, Geometry, NewAnnotation, Point } from '../geometry/model.js';
import { MAX_POINTS, MAX_TEXT } from '../geometry/model.js';

/** W3C Web Annotation Data Model, the parts this kit reads and writes. */
export interface W3CBody {
  type: 'TextualBody';
  purpose: string;
  value: string;
  format?: string;
}

export type W3CSelector =
  | { type: 'FragmentSelector'; conformsTo?: string; value: string }
  | { type: 'SvgSelector'; value: string };

export interface W3CAnnotation {
  '@context': string;
  id: string;
  type: 'Annotation';
  body: W3CBody[];
  target: { source: string; selector: W3CSelector };
  created?: string;
  modified?: string;
  creator?: { type: 'Person'; id: string };
}

export const W3C_CONTEXT = 'http://www.w3.org/ns/anno.jsonld';
const MEDIA_FRAGMENTS = 'http://www.w3.org/TR/media-frags/';
const ID_PREFIX = 'urn:tessera:annotation:';
const MAX_SVG = 1_000_000;

const num = (n: number): string => String(Math.round(n * 100) / 100);
const pairs = (pts: ReadonlyArray<readonly number[]>): string =>
  pts.map((p) => `${num(p[0] as number)},${num(p[1] as number)}`).join(' ');
const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function selectorFor(g: Geometry): W3CSelector {
  const svg = (inner: string): W3CSelector => ({
    type: 'SvgSelector',
    value: `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`,
  });
  switch (g.type) {
    case 'rect':
      if (!g.rotation) {
        return {
          type: 'FragmentSelector',
          conformsTo: MEDIA_FRAGMENTS,
          value: `xywh=pixel:${num(g.x)},${num(g.y)},${num(g.w)},${num(g.h)}`,
        };
      }
      return svg(
        `<rect x="${num(g.x)}" y="${num(g.y)}" width="${num(g.w)}" height="${num(g.h)}" transform="rotate(${num(g.rotation)} ${num(g.x + g.w / 2)} ${num(g.y + g.h / 2)})"/>`,
      );
    case 'ellipse':
      return svg(
        `<ellipse cx="${num(g.cx)}" cy="${num(g.cy)}" rx="${num(g.rx)}" ry="${num(g.ry)}"/>`,
      );
    case 'polygon':
      return svg(`<polygon points="${pairs(g.points)}"/>`);
    case 'polyline': {
      const classes = [g.arrowStart ? 'arrow-start' : '', g.arrowEnd ? 'arrow-end' : '']
        .filter(Boolean)
        .join(' ');
      return svg(`<polyline${classes ? ` class="${classes}"` : ''} points="${pairs(g.points)}"/>`);
    }
    case 'freehand':
      return svg(
        `<path class="freehand" d="M${g.points.map((p) => `${num(p[0])} ${num(p[1])}`).join(' L')}"/>`,
      );
    case 'point':
      // A circle of radius 0 is how a point travels: Web Annotation has no point selector.
      return svg(`<circle cx="${num(g.x)}" cy="${num(g.y)}" r="0"/>`);
    case 'text':
      return svg(
        `<text x="${num(g.x)}" y="${num(g.y)}" font-size="${num(g.fontSize)}">${escapeXml(g.text)}</text>`,
      );
  }
}

/** Exports annotations as W3C Web Annotations targeting `source`. */
export function exportW3C(annotations: readonly Annotation[], source: string): W3CAnnotation[] {
  return annotations.map((a) => ({
    '@context': W3C_CONTEXT,
    id: `${ID_PREFIX}${a.id}`,
    type: 'Annotation',
    body: a.bodies.map((b) => ({
      type: 'TextualBody',
      purpose: b.purpose,
      value: b.value,
      format: 'text/plain',
    })),
    target: { source, selector: selectorFor(a.geometry) },
    created: a.createdAt,
    modified: a.updatedAt,
    ...(a.createdBy ? { creator: { type: 'Person' as const, id: a.createdBy } } : {}),
  }));
}

// ---------------------------------------------------------------------------------------------
// Import. The SVG is read by a small scanner instead of DOMParser: it works without a DOM, and it
// only ever looks at the handful of shapes below, so nothing in a foreign document is executed,
// fetched or styled.
// ---------------------------------------------------------------------------------------------

interface Tag {
  name: string;
  attrs: Record<string, string>;
  text?: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e.startsWith('#x')) return String.fromCodePoint(Number.parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(Number.parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Splits an SVG string into its tags. Returns `null` for anything that is not plain, well-formed SVG. */
function scan(svg: string): Tag[] | null {
  if (svg.length > MAX_SVG || /<!(doctype|entity|\[cdata)/i.test(svg)) return null;
  const tags: Tag[] = [];
  const stack: string[] = [];
  const re = /<\s*(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(svg);
  while (m) {
    // Between tags only whitespace and comments are allowed (text belongs inside <text>).
    if (
      svg
        .slice(last, m.index)
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim() !== ''
    )
      return null;
    const [whole, closing, rawName, rawAttrs, selfClosing] = m as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    const name = rawName.toLowerCase().replace(/^svg:/, '');
    let resume = m.index + whole.length;
    if (closing) {
      if (stack.pop() !== name) return null;
    } else {
      const attrs: Record<string, string> = {};
      for (const a of rawAttrs.matchAll(/([^\s=>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs[(a[1] as string).toLowerCase()] = decode((a[2] ?? a[3]) as string);
      }
      const tag: Tag = { name, attrs };
      if (name === 'text' && !selfClosing) {
        const end = svg.indexOf('</', resume);
        if (end === -1) return null;
        tag.text = decode(svg.slice(resume, end).replace(/<[^>]*>/g, ''));
        // Continue at the closing tag, so the text itself is not mistaken for stray content.
        resume = end;
        re.lastIndex = end;
      }
      tags.push(tag);
      if (!selfClosing) stack.push(name);
    }
    last = resume;
    m = re.exec(svg);
  }
  if (stack.length > 0 || tags[0]?.name !== 'svg') return null;
  return tags;
}

const numbers = (s: string | undefined): number[] | null => {
  if (s === undefined) return null;
  const parts = s
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  return parts.length > 0 && parts.every(Number.isFinite) ? parts : null;
};

function readPoints(s: string | undefined): Point[] | null {
  const n = numbers(s);
  if (!n || n.length % 2 !== 0 || n.length / 2 > MAX_POINTS) return null;
  const out: Point[] = [];
  for (let i = 0; i < n.length; i += 2) out.push([n[i] as number, n[i + 1] as number]);
  return out;
}

/** Reads M, L, H, V and Z (absolute and relative): all that straight-sided shapes need. */
function readPath(d: string | undefined): { points: Point[]; closed: boolean } | null {
  if (!d) return null;
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return null;
  const points: Point[] = [];
  let cx = 0;
  let cy = 0;
  let closed = false;
  let cmd = '';
  let i = 0;
  const next = (): number | null => {
    const t = tokens[i];
    if (t === undefined || /^[a-zA-Z]$/.test(t)) return null;
    i += 1;
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  };
  while (i < tokens.length) {
    const t = tokens[i] as string;
    if (/^[a-zA-Z]$/.test(t)) {
      cmd = t;
      i += 1;
      if (cmd === 'z' || cmd === 'Z') {
        closed = true;
        continue;
      }
    } else if (cmd === '') return null;
    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    if (upper === 'M' || upper === 'L') {
      const x = next();
      const y = next();
      if (x === null || y === null) return null;
      cx = rel ? cx + x : x;
      cy = rel ? cy + y : y;
      if (upper === 'M' && cmd === 'M' && points.length === 0) cmd = 'L';
      else if (upper === 'M' && cmd === 'm' && points.length === 0) cmd = 'l';
    } else if (upper === 'H') {
      const x = next();
      if (x === null) return null;
      cx = rel ? cx + x : x;
    } else if (upper === 'V') {
      const y = next();
      if (y === null) return null;
      cy = rel ? cy + y : y;
    } else return null; // curves and arcs
    points.push([cx, cy]);
    if (points.length > MAX_POINTS) return null;
  }
  return points.length > 0 ? { points, closed } : null;
}

function rotationOf(transform: string | undefined): number | null | undefined {
  if (!transform) return undefined;
  const m = /^\s*rotate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+))?\s*\)\s*$/.exec(
    transform,
  );
  return m ? Number(m[1]) : null;
}

const CONTAINERS = new Set(['g', 'title', 'desc']);
const SHAPES = new Set([
  'rect',
  'ellipse',
  'circle',
  'polygon',
  'polyline',
  'path',
  'text',
  'line',
]);

/** Parses an SvgSelector value into a geometry, or explains why it cannot. */
export function parseSvgSelector(svg: string): { geometry: Geometry } | { error: string } {
  const tags = scan(svg);
  if (!tags) return { error: 'the SVG is malformed or uses unsupported markup' };
  const inner = tags.slice(1);
  const odd = inner.find((t) => !SHAPES.has(t.name) && !CONTAINERS.has(t.name));
  if (odd) return { error: `<${odd.name}> is not supported` };
  const shapes = inner.filter((t) => SHAPES.has(t.name));
  if (shapes.length === 0) return { error: 'the SVG contains no shape' };
  if (shapes.length > 1) return { error: 'only one shape per selector is supported' };
  const shape = shapes[0] as Tag;
  const a = shape.attrs;
  const classes = new Set((a.class ?? '').split(/\s+/));
  switch (shape.name) {
    case 'rect': {
      const x = Number(a.x ?? 0);
      const y = Number(a.y ?? 0);
      const w = Number(a.width);
      const h = Number(a.height);
      const rotation = rotationOf(a.transform);
      if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0)
        return { error: 'invalid <rect>' };
      if (rotation === null) return { error: 'only rotate() transforms are supported' };
      return { geometry: { type: 'rect', x, y, w, h, ...(rotation ? { rotation } : {}) } };
    }
    case 'ellipse': {
      const g = {
        cx: Number(a.cx ?? 0),
        cy: Number(a.cy ?? 0),
        rx: Number(a.rx),
        ry: Number(a.ry),
      };
      if (!Object.values(g).every(Number.isFinite) || g.rx < 0 || g.ry < 0)
        return { error: 'invalid <ellipse>' };
      return { geometry: { type: 'ellipse', ...g } };
    }
    case 'circle': {
      const cx = Number(a.cx ?? 0);
      const cy = Number(a.cy ?? 0);
      const r = Number(a.r);
      if (![cx, cy, r].every(Number.isFinite) || r < 0) return { error: 'invalid <circle>' };
      return {
        geometry:
          r === 0 ? { type: 'point', x: cx, y: cy } : { type: 'ellipse', cx, cy, rx: r, ry: r },
      };
    }
    case 'polygon': {
      const points = readPoints(a.points);
      if (!points || points.length < 3) return { error: 'a <polygon> needs three points' };
      return { geometry: { type: 'polygon', points } };
    }
    case 'polyline': {
      const points = readPoints(a.points);
      if (!points || points.length < 2) return { error: 'a <polyline> needs two points' };
      return {
        geometry: {
          type: 'polyline',
          points,
          ...(classes.has('arrow-start') ? { arrowStart: true } : {}),
          ...(classes.has('arrow-end') ? { arrowEnd: true } : {}),
        },
      };
    }
    case 'line': {
      const p = [Number(a.x1 ?? 0), Number(a.y1 ?? 0), Number(a.x2 ?? 0), Number(a.y2 ?? 0)];
      if (!p.every(Number.isFinite)) return { error: 'invalid <line>' };
      return {
        geometry: {
          type: 'polyline',
          points: [
            [p[0] as number, p[1] as number],
            [p[2] as number, p[3] as number],
          ],
        },
      };
    }
    case 'path': {
      const path = readPath(a.d);
      if (!path) return { error: 'only straight M, L, H, V and Z path commands are supported' };
      if (classes.has('freehand')) {
        return {
          geometry: {
            type: 'freehand',
            points: path.points.map((p): [number, number, number] => [p[0], p[1], 0.5]),
          },
        };
      }
      if (path.closed && path.points.length >= 3)
        return { geometry: { type: 'polygon', points: path.points } };
      if (path.points.length >= 2) return { geometry: { type: 'polyline', points: path.points } };
      return { error: 'the path has too few points' };
    }
    case 'text': {
      const x = Number(a.x ?? 0);
      const y = Number(a.y ?? 0);
      const fontSize = Number(a['font-size'] ?? 16);
      const text = (shape.text ?? '').slice(0, MAX_TEXT);
      if (![x, y, fontSize].every(Number.isFinite) || fontSize < 1 || text === '')
        return { error: 'invalid <text>' };
      return { geometry: { type: 'text', x, y, text, fontSize } };
    }
  }
  return { error: 'unsupported shape' };
}

function parseFragment(value: string): { geometry: Geometry } | { error: string } {
  const m = /^xywh=(?:(pixel|percent):)?(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/.exec(
    value.trim(),
  );
  if (!m) return { error: 'unsupported fragment' };
  if (m[1] === 'percent')
    return { error: 'percent fragments need the image size and are not supported' };
  const [x, y, w, h] = [m[2], m[3], m[4], m[5]].map(Number) as [number, number, number, number];
  if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0) return { error: 'invalid fragment' };
  return { geometry: { type: 'rect', x, y, w, h } };
}

const PURPOSES: Record<string, Body['purpose']> = {
  tagging: 'tagging',
  commenting: 'commenting',
  describing: 'describing',
  classifying: 'tagging',
};

export interface ImportResult {
  annotations: NewAnnotation[];
  /** One message per annotation or body that was skipped or changed. */
  warnings: string[];
}

const validDate = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** Reads W3C Web Annotations. Anything it cannot represent is skipped with a warning; it never throws. */
export function importW3C(list: unknown): ImportResult {
  const out: ImportResult = { annotations: [], warnings: [] };
  if (!Array.isArray(list)) {
    out.warnings.push('expected a list of annotations');
    return out;
  }
  list.forEach((raw, i) => {
    const label = `annotation ${i + 1}`;
    if (typeof raw !== 'object' || raw === null) {
      out.warnings.push(`${label}: not an object`);
      return;
    }
    const a = raw as Record<string, unknown>;
    const target = Array.isArray(a.target) ? a.target[0] : a.target;
    const selector = asArray<Record<string, unknown>>(
      (target as { selector?: Record<string, unknown> | Record<string, unknown>[] } | undefined)
        ?.selector,
    )[0];
    if (!selector || typeof selector.value !== 'string') {
      out.warnings.push(`${label}: no selector (the whole target cannot become a shape)`);
      return;
    }
    const parsed =
      selector.type === 'SvgSelector'
        ? parseSvgSelector(selector.value)
        : selector.type === 'FragmentSelector'
          ? parseFragment(selector.value)
          : { error: `${String(selector.type)} is not supported` };
    if ('error' in parsed) {
      out.warnings.push(`${label}: ${parsed.error}`);
      return;
    }
    const bodies: Body[] = [];
    for (const b of asArray<unknown>(a.body as unknown)) {
      const body =
        typeof b === 'string'
          ? { value: b, purpose: 'commenting' }
          : (b as Record<string, unknown>);
      if (typeof body.value !== 'string') continue;
      const purpose = PURPOSES[String(body.purpose ?? 'commenting')];
      if (!purpose)
        out.warnings.push(`${label}: purpose "${String(body.purpose)}" imported as a comment`);
      bodies.push({ purpose: purpose ?? 'commenting', value: body.value.slice(0, 5000) });
    }
    const id =
      typeof a.id === 'string' && a.id !== ''
        ? a.id.replace(ID_PREFIX, '').slice(0, 80)
        : undefined;
    const creator = (a.creator as { id?: unknown } | undefined)?.id;
    const created = validDate(a.created);
    const modified = validDate(a.modified);
    out.annotations.push({
      ...(id ? { id } : {}),
      geometry: parsed.geometry,
      bodies,
      ...(typeof creator === 'string' ? { createdBy: creator.slice(0, 120) } : {}),
      ...(created ? { createdAt: created } : {}),
      ...(modified || created ? { updatedAt: (modified ?? created) as string } : {}),
    });
  });
  return out;
}
