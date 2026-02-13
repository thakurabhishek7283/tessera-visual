import { describe, expect, it } from 'vitest';
import type { Annotation, Geometry } from '../src/geometry/model.js';
import { overlaySvg, renderPng } from '../src/interop/export-png.js';

const make = (geometry: Geometry, extra: Partial<Annotation> = {}): Annotation => ({
  id: 'a',
  geometry,
  bodies: [],
  createdAt: 't',
  updatedAt: 't',
  ...extra,
});

function solidImage(w: number, h: number, color: string): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  return c.toDataURL('image/png');
}

async function pixels(
  blob: Blob,
): Promise<(x: number, y: number) => [number, number, number, number]> {
  const bitmap = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bitmap.width;
  c.height = bitmap.height;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.drawImage(bitmap, 0, 0);
  return (x, y) => [...g.getImageData(x, y, 1, 1).data] as [number, number, number, number];
}

describe('overlaySvg', () => {
  it('resolves palette names to concrete colours and drops CSS variables', () => {
    const svg = overlaySvg({
      rect: { x: 0, y: 0, w: 100, h: 50 },
      annotations: [
        make({ type: 'rect', x: 1, y: 2, w: 3, h: 4 }, { style: { stroke: 'red' } }),
        make({ type: 'text', x: 0, y: 0, text: 'a<b', fontSize: 12 }),
      ],
      strokesScale: false,
    });
    expect(svg).toContain('viewBox="0 0 100 50"');
    expect(svg).not.toContain('var(');
    expect(svg).toContain('stroke:#b91c1c');
    expect(svg).toContain('a&lt;b');
  });

  it('scales on-screen strokes by the factor, and skips hidden shapes', () => {
    const svg = overlaySvg({
      rect: { x: 0, y: 0, w: 10, h: 10 },
      annotations: [
        make({ type: 'rect', x: 0, y: 0, w: 5, h: 5 }, { style: { strokeWidth: 2 } }),
        make({ type: 'rect', x: 0, y: 0, w: 5, h: 5 }, { hidden: true }),
      ],
      strokesScale: false,
      strokeFactor: 4,
    });
    expect(svg.match(/<rect/g)).toHaveLength(1);
    expect(svg).toContain('stroke-width:8');
    expect(svg).not.toContain('vector-effect');
  });
});

describe('renderPng', () => {
  it('draws the image at its natural size with the shapes on top', async () => {
    const { blob, warnings } = await renderPng({
      rect: { x: 0, y: 0, w: 100, h: 60 },
      image: solidImage(100, 60, '#ffffff'),
      annotations: [
        make(
          { type: 'rect', x: 20, y: 10, w: 40, h: 30 },
          { style: { stroke: '#ff0000', fill: '#ff0000', strokeWidth: 4 } },
        ),
      ],
      strokesScale: true,
    });
    expect(warnings).toEqual([]);
    expect(blob.type).toBe('image/png');
    const px = await pixels(blob);
    expect(px(90, 55)).toEqual([255, 255, 255, 255]);
    // An explicit fill is drawn at 30 % over the white image: a light red.
    const [r, g, b] = px(40, 25);
    expect(r).toBeGreaterThan(240);
    expect(g).toBeLessThan(200);
    expect(b).toBeLessThan(200);
    // The 4 px stroke is solid red.
    const [er, eg] = px(20, 25);
    expect(er).toBeGreaterThan(240);
    expect(eg).toBeLessThan(40);
  });

  it('exports the content of a board on a background colour', async () => {
    const { blob } = await renderPng({
      rect: { x: -50, y: -50, w: 100, h: 100 },
      background: '#00ff00',
      annotations: [],
      strokesScale: true,
    });
    const px = await pixels(blob);
    expect(px(10, 10)).toEqual([0, 255, 0, 255]);
  });

  it('falls back to the shapes alone, with a warning, when the image cannot be read', async () => {
    const { blob, warnings } = await renderPng({
      rect: { x: 0, y: 0, w: 40, h: 40 },
      image: 'data:image/png;base64,AAAA',
      annotations: [
        make(
          { type: 'rect', x: 0, y: 0, w: 40, h: 40 },
          { style: { stroke: '#0000ff', fill: '#0000ff' } },
        ),
      ],
      strokesScale: true,
    });
    expect(warnings).toHaveLength(1);
    const px = await pixels(blob);
    expect(px(20, 20)[3]).toBeGreaterThan(0);
    expect(px(20, 20)[2]).toBeGreaterThan(200);
  });

  it('keeps huge areas within the pixel budget', async () => {
    const { blob } = await renderPng({
      rect: { x: 0, y: 0, w: 20_000, h: 20_000 },
      annotations: [],
      strokesScale: true,
    });
    const bitmap = await createImageBitmap(blob);
    expect(bitmap.width * bitmap.height).toBeLessThanOrEqual(64_000_000 * 1.01);
  });
});
