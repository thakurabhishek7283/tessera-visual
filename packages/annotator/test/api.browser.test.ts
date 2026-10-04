import { createTestInstance } from '@tessera-kit/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnnotatorApi, AnnotatorHandle } from '../src/index.js';

const NS = 'http://www.w3.org/2000/svg';
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
  document.body.replaceChildren();
});

function image(w = 400, h = 300): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#e8eef6';
  g.fillRect(0, 0, w, h);
  return c.toDataURL('image/png');
}

async function setup(features: Record<string, unknown> = {}) {
  const { instance, clock } = await createTestInstance(
    { features: { annotator: { enabled: true, ...features } } },
    { annotator: () => import('../src/plugin.js') },
  );
  const api = instance.feature('annotator') as AnnotatorApi;
  cleanups.push(() => instance.destroy());
  const host = document.createElement('div');
  host.style.cssText = 'width:600px;height:400px;position:relative';
  document.body.append(host);
  return { api, host, instance, clock };
}

const open = async (
  api: AnnotatorApi,
  host: HTMLElement,
  opts: Parameters<AnnotatorApi['create']>[1],
): Promise<AnnotatorHandle> => {
  const handle = await api.create(host, opts);
  cleanups.push(() => handle.destroy());
  return handle;
};

const pointer = (svg: Element, type: string, x: number, y: number): void => {
  const box = svg.getBoundingClientRect();
  svg.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: box.left + x,
      clientY: box.top + y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
    }),
  );
};

describe('AnnotatorApi.create', () => {
  it('mounts an SVG that fills the host and fits the image into it', async () => {
    const { api, host } = await setup();
    const handle = await open(api, host, { mode: 'image', src: image(), setId: 'a' });
    const svg = host.querySelector('svg');
    expect(svg?.getBoundingClientRect().width).toBe(600);
    expect(svg?.querySelector('.background image')).not.toBeNull();
    // 400×300 image into 600×400 with 16 px padding: limited by the height.
    expect(handle.view.get().scale).toBeCloseTo((400 - 32) / 300);
    expect(handle.source).toMatch(/^data:image\/png/);
  });

  it('needs an image for image mode and reports an image that cannot load', async () => {
    const { api, host } = await setup();
    await expect(api.create(host, { mode: 'image' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      api.create(host, { mode: 'image', src: 'data:image/png;base64,AAAA' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(host.querySelector('svg')).toBeNull();
  });

  it('draws with the pointer and fires the hooks', async () => {
    const { api, host } = await setup();
    const beforeCreate = vi.fn(() => true);
    const handle = await open(api, host, {
      mode: 'image',
      src: image(),
      setId: 'b',
      hooks: { beforeCreate },
    });
    const svg = host.querySelector('svg') as SVGSVGElement;
    handle.setTool('rect');
    pointer(svg, 'pointerdown', 100, 100);
    pointer(svg, 'pointermove', 200, 180);
    pointer(svg, 'pointerup', 200, 180);
    await vi.waitFor(() => expect(handle.annotations.get()).toHaveLength(1));
    expect(beforeCreate).toHaveBeenCalledOnce();
    expect(handle.annotations.get()[0]?.geometry.type).toBe('rect');
    expect(handle.selection.get()).toEqual([handle.annotations.get()[0]?.id]);
  });

  it('lets the host veto a shape through the hook', async () => {
    const { api, host } = await setup();
    const handle = await open(api, host, {
      mode: 'image',
      src: image(),
      setId: 'c',
      hooks: { beforeCreate: () => false },
    });
    const svg = host.querySelector('svg') as SVGSVGElement;
    handle.setTool('rect');
    pointer(svg, 'pointerdown', 100, 100);
    pointer(svg, 'pointermove', 200, 180);
    pointer(svg, 'pointerup', 200, 180);
    await new Promise((r) => setTimeout(r, 30));
    expect(handle.annotations.get()).toEqual([]);
  });

  it('adds, updates, hides, removes and undoes through the handle', async () => {
    const { api, host } = await setup();
    const handle = await open(api, host, { mode: 'image', src: image(), setId: 'd' });
    const a = handle.add({ geometry: { type: 'rect', x: 10, y: 10, w: 50, h: 50 }, bodies: [] });
    handle.update(a.id, { bodies: [{ purpose: 'tagging', value: 'tent' }] });
    handle.setVisible(a.id, false);
    expect(handle.annotations.get()[0]).toMatchObject({
      hidden: true,
      bodies: [{ value: 'tent' }],
    });
    await handle.history.undo();
    expect(handle.annotations.get()[0]?.hidden).toBeUndefined();
    handle.select([a.id]);
    handle.remove([a.id]);
    expect(handle.annotations.get()).toEqual([]);
    expect(handle.selection.get()).toEqual([]);
  });

  it('reports local changes to subscribers', async () => {
    const { api, host } = await setup();
    const handle = await open(api, host, { mode: 'image', src: image(), setId: 'e' });
    const seen: number[] = [];
    const off = handle.on('change', (c) => seen.push(c.created.length));
    handle.add({ geometry: { type: 'point', x: 1, y: 1 }, bodies: [] });
    off();
    handle.add({ geometry: { type: 'point', x: 2, y: 2 }, bodies: [] });
    expect(seen).toEqual([1]);
  });

  it('keeps the set between mounts, and removes the surface on destroy', async () => {
    const { api, host } = await setup();
    const src = image();
    const first = await api.create(host, { mode: 'image', src, setId: 'keep' });
    first.add({ geometry: { type: 'point', x: 5, y: 5 }, bodies: [] });
    await first.destroy();
    expect(host.querySelector('svg')).toBeNull();
    const second = await open(api, host, { mode: 'image', src, setId: 'keep' });
    expect(second.annotations.get()).toHaveLength(1);
  });

  it('does not store anything when persistence is none', async () => {
    const { api, host } = await setup();
    const src = image();
    const first = await api.create(host, {
      mode: 'image',
      src,
      setId: 'none',
      config: { persistence: 'none' },
    });
    first.add({ geometry: { type: 'point', x: 5, y: 5 }, bodies: [] });
    await first.destroy();
    const second = await open(api, host, {
      mode: 'image',
      src,
      setId: 'none',
      config: { persistence: 'none' },
    });
    expect(second.annotations.get()).toEqual([]);
  });

  it('exports W3C annotations and imports them back as one undo step', async () => {
    const { api, host } = await setup();
    const handle = await open(api, host, { mode: 'image', src: image(), setId: 'f' });
    handle.add({
      geometry: { type: 'rect', x: 1, y: 2, w: 3, h: 4 },
      bodies: [{ purpose: 'tagging', value: 'a' }],
    });
    handle.add({ geometry: { type: 'ellipse', cx: 9, cy: 9, rx: 2, ry: 2 }, bodies: [] });
    const exported = handle.exportW3C();
    expect(exported).toHaveLength(2);
    expect(exported[0]?.target.source).toBe(handle.source);
    handle.remove(handle.annotations.get().map((a) => a.id));
    const warnings = handle.importW3C([...exported, { target: 'nope' }], 'replace');
    expect(warnings).toHaveLength(1);
    expect(handle.annotations.get()).toHaveLength(2);
    await handle.history.undo();
    expect(handle.annotations.get()).toHaveLength(0);
  });

  it('merge keeps shapes that are newer than the import', async () => {
    const { api, host, clock } = await setup();
    const handle = await open(api, host, { mode: 'image', src: image(), setId: 'g' });
    const a = handle.add({ geometry: { type: 'point', x: 1, y: 1 }, bodies: [] });
    const exported = handle.exportW3C();
    clock.advance(5000);
    handle.update(a.id, { bodies: [{ purpose: 'commenting', value: 'newer' }] });
    handle.importW3C(exported, 'merge');
    expect(handle.annotations.get()[0]?.bodies[0]?.value).toBe('newer');
    expect(handle.annotations.get()).toHaveLength(1);
  });

  it('exports a PNG of the image with its shapes', async () => {
    const { api, host } = await setup();
    const handle = await open(api, host, { mode: 'image', src: image(400, 300), setId: 'h' });
    handle.add({ geometry: { type: 'rect', x: 50, y: 50, w: 100, h: 80 }, bodies: [] });
    const blob = await handle.exportPNG();
    expect(blob.type).toBe('image/png');
    const bitmap = await createImageBitmap(blob);
    expect([bitmap.width, bitmap.height]).toEqual([400, 300]);
  });

  it('makes a board with a dot grid, exports its content, and shares a default board', async () => {
    const { api, host } = await setup();
    const board = await open(api, host, { mode: 'board', setId: 'wb' });
    expect(host.querySelector('.background pattern')).not.toBeNull();
    board.add({ geometry: { type: 'rect', x: 0, y: 0, w: 200, h: 100 }, bodies: [] });
    const bitmap = await createImageBitmap(await board.exportPNG());
    expect([bitmap.width, bitmap.height]).toEqual([280, 180]);
    expect(board.source).toBe('board:wb');
  });

  it('builds the surface with no element sizing assumptions: it measures its host', async () => {
    const { api, host } = await setup();
    const handle = await open(api, host, { mode: 'board', setId: 'wb2' });
    const before = handle.view.get().scale;
    host.style.width = '300px';
    host.style.height = '200px';
    await vi.waitFor(() =>
      expect(host.querySelector('svg')?.getBoundingClientRect().width).toBe(300),
    );
    expect(before).toBeGreaterThan(0);
  });

  it('closes every open surface when the feature is disabled', async () => {
    const { api, host, instance } = await setup();
    const handle = await api.create(host, { mode: 'board', setId: 'wb3' });
    await instance.disable('annotator');
    expect(host.querySelector('svg')).toBeNull();
    await handle.destroy();
  });

  it('marks locked shapes and ignores edits through the tool', async () => {
    const { api, host } = await setup();
    const handle = await open(api, host, { mode: 'image', src: image(), setId: 'i' });
    const a = handle.add({
      geometry: { type: 'rect', x: 0, y: 0, w: 100, h: 100 },
      bodies: [],
      locked: true,
    });
    handle.select([a.id]);
    const svg = host.querySelector('svg') as SVGSVGElement;
    pointer(svg, 'pointerdown', 50, 40);
    pointer(svg, 'pointermove', 200, 200);
    pointer(svg, 'pointerup', 200, 200);
    expect(handle.annotations.get()[0]?.geometry).toEqual(a.geometry);
    void NS;
  });
});
