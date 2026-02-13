import { concreteColor } from '../engine/color.js';
import { describeShape, type SvgNode } from '../engine/shape-svg.js';
import type { Annotation, Rect } from '../geometry/model.js';

export interface PngExportOptions {
  /** World area to render: the whole image, or the content of a board. */
  rect: Rect;
  annotations: readonly Annotation[];
  /** Board strokes are in world units; image strokes keep their on-screen width. */
  strokesScale: boolean;
  /** For image strokes: how many world units one stroke pixel is worth (1 / fitted zoom). */
  strokeFactor?: number;
  brush?: { thinning: number; smoothing: number; streamline: number };
  image?: string | null;
  background?: string;
  /** Output pixels per world unit. */
  scale?: number;
  /** Reads a CSS custom property, so palette names resolve to the colours on screen. */
  readVar?: (name: string) => string;
}

export interface PngExport {
  blob: Blob;
  /** What could not be included, e.g. an image that does not allow cross-origin use. */
  warnings: string[];
}

const MAX_PIXELS = 64_000_000;
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** CSS variables do not exist inside a standalone SVG image: keep only their fallback. */
const flatten = (value: string | number): string =>
  String(value).replace(/var\(\s*--[\w-]+\s*(?:,\s*([^)]+))?\)/g, (_m, fallback?: string) =>
    (fallback ?? 'sans-serif').trim(),
  );

function markup(node: SvgNode, factor: number): string {
  const style = { ...node.style };
  if (factor !== 1 && 'vector-effect' in style) {
    style['stroke-width'] = Number(style['stroke-width']) * factor;
  }
  delete style['vector-effect'];
  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join('');
  const css = Object.entries(style)
    .map(([k, v]) => `${k}:${flatten(v)}`)
    .join(';');
  const inner =
    (node.text !== undefined ? esc(node.text) : '') +
    (node.children ?? []).map((c) => markup(c, factor)).join('');
  return `<${node.tag}${attrs} style="${esc(css)}">${inner}</${node.tag}>`;
}

/** The shapes as a standalone SVG document covering `rect`. */
export function overlaySvg(o: PngExportOptions): string {
  const factor = o.strokeFactor ?? 1;
  const body = o.annotations
    .filter((a) => !a.hidden)
    .flatMap((a) =>
      describeShape(a, {
        strokeScales: o.strokesScale,
        color: (v) => concreteColor(v, o.readVar),
        ...(o.brush ? { brush: o.brush } : {}),
      }),
    )
    .map((n) => markup(n, factor))
    .join('');
  const { x, y, w, h } = o.rect;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
}

function load(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

/** Renders the image (when it can be read) with the shapes on top, as a PNG. */
export async function renderPng(o: PngExportOptions): Promise<PngExport> {
  const warnings: string[] = [];
  let scale = o.scale ?? 1;
  const pixels = o.rect.w * scale * (o.rect.h * scale);
  if (pixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / pixels);
  const width = Math.max(1, Math.round(o.rect.w * scale));
  const height = Math.max(1, Math.round(o.rect.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('canvas is not available');

  if (o.background) {
    g.fillStyle = o.background;
    g.fillRect(0, 0, width, height);
  }
  if (o.image) {
    try {
      const img = await load(o.image, !o.image.startsWith('data:'));
      g.drawImage(
        img,
        -o.rect.x * scale,
        -o.rect.y * scale,
        img.naturalWidth * scale,
        img.naturalHeight * scale,
      );
    } catch {
      warnings.push(
        'The image could not be read (it may not allow cross-origin use), so the export contains only the shapes.',
      );
    }
  }
  const svg = new Blob([overlaySvg(o)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svg);
  try {
    g.drawImage(await load(url, false), 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  );
  return { blob, warnings };
}
