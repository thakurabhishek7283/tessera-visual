import { afterEach, describe, expect, it } from 'vitest';
import { attachInput } from '../src/engine/input.js';
import { Renderer } from '../src/engine/renderer.js';
import type { Tool } from '../src/engine/tools.js';
import { makeEngine, put, rectOf } from './helpers.js';

const NS = 'http://www.w3.org/2000/svg';
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  document.body.replaceChildren();
});

function mount(config = {}, mode: 'image' | 'board' = 'image') {
  const log: string[] = [];
  const t = makeEngine(config, mode, (engine) => {
    const spy = (id: Tool['id']): Tool => ({
      id,
      cursor: 'default',
      onPointerDown: (e) =>
        log.push(`down ${e.world.map(Math.round).join(',')} ${e.pointerType} p${e.pressure}`),
      onPointerMove: (e) => log.push(`move ${e.world.map(Math.round).join(',')}`),
      onPointerUp: (e) => log.push(`up ${e.world.map(Math.round).join(',')}`),
      onDoubleClick: () => log.push('dblclick'),
      cancel: () => log.push('cancel'),
    });
    for (const id of ['select', 'rect', 'pan'] as const) engine.tools.register(spy(id));
  });
  const host = document.createElement('div');
  host.tabIndex = 0;
  host.style.cssText = 'width:800px;height:600px;position:relative';
  const svg = document.createElementNS(NS, 'svg');
  svg.style.cssText = 'width:800px;height:600px;display:block;touch-action:none';
  host.append(svg);
  document.body.append(host);
  const renderer = new Renderer(t.engine, svg);
  const detach = attachInput(t.engine, svg, host);
  cleanups.push(() => {
    detach();
    renderer.destroy();
  });
  return { ...t, host, svg, renderer, log };
}

const pointer = (
  el: Element,
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {},
): void => {
  const box = el.getBoundingClientRect();
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: box.left + x,
      clientY: box.top + y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      ...init,
    }),
  );
};

describe('Renderer', () => {
  it('paints one group per annotation in z-order, with the geometry as attributes', () => {
    const { engine, renderer } = mount();
    const a = put(engine, rectOf(10, 20, 30, 40));
    const b = put(engine, { type: 'ellipse', cx: 50, cy: 50, rx: 5, ry: 6 });
    renderer.flush();
    const ids = [...renderer.shapes.children].map((c) => c.getAttribute('data-id'));
    expect(ids).toEqual([a.id, b.id]);
    const rect = renderer.nodeOf(a.id)?.querySelector('rect');
    expect(rect?.getAttribute('width')).toBe('30');
    expect(rect?.style.getPropertyValue('vector-effect')).toBe('non-scaling-stroke');
    expect(renderer.nodeOf(b.id)?.querySelector('ellipse')?.getAttribute('rx')).toBe('5');
  });

  it('keeps stroke widths in world units on a board', () => {
    const { engine, renderer } = mount({}, 'board');
    const a = put(engine, rectOf(0, 0, 10, 10));
    renderer.flush();
    expect(
      renderer.nodeOf(a.id)?.querySelector('rect')?.style.getPropertyValue('vector-effect'),
    ).toBe('');
  });

  it('reuses unchanged nodes, replaces changed ones and drops removed ones', () => {
    const { engine, renderer } = mount();
    const a = put(engine, rectOf(0, 0, 10, 10));
    const b = put(engine, rectOf(20, 0, 10, 10));
    renderer.flush();
    const nodeA = renderer.nodeOf(a.id);
    const nodeB = renderer.nodeOf(b.id);
    engine.update(b.id, { geometry: rectOf(40, 0, 10, 10) });
    renderer.flush();
    expect(renderer.nodeOf(a.id)).toBe(nodeA);
    expect(renderer.nodeOf(b.id)).not.toBe(nodeB);
    expect(renderer.nodeOf(b.id)?.querySelector('rect')?.getAttribute('x')).toBe('40');
    engine.store.remove([a.id]);
    renderer.flush();
    expect(renderer.nodeOf(a.id)).toBeUndefined();
    expect(renderer.shapes.children).toHaveLength(1);
  });

  it('follows a reorder without recreating nodes', () => {
    const { engine, renderer } = mount();
    const a = put(engine, rectOf(0, 0, 10, 10));
    const b = put(engine, rectOf(20, 0, 10, 10));
    renderer.flush();
    const nodeA = renderer.nodeOf(a.id);
    engine.store.reorder([a.id], 'front');
    renderer.flush();
    expect([...renderer.shapes.children].map((c) => c.getAttribute('data-id'))).toEqual([
      b.id,
      a.id,
    ]);
    expect(renderer.nodeOf(a.id)).toBe(nodeA);
  });

  it('hides hidden annotations', () => {
    const { engine, renderer } = mount();
    const a = put(engine, rectOf(0, 0, 10, 10), { hidden: true });
    renderer.flush();
    expect(renderer.nodeOf(a.id)?.getAttribute('display')).toBe('none');
  });

  it('only changes the transform when the viewport moves', () => {
    const { engine, renderer } = mount();
    const a = put(engine, rectOf(0, 0, 10, 10));
    renderer.flush();
    const node = renderer.nodeOf(a.id);
    engine.viewport.set({ scale: 2, tx: 30, ty: -10 });
    renderer.flush();
    expect(renderer.nodeOf(a.id)).toBe(node);
    expect(renderer.world.getAttribute('transform')).toBe('matrix(2 0 0 2 30 -10)');
  });

  it('batches updates into one animation frame', async () => {
    const { engine, renderer } = mount();
    engine.viewport.set({ scale: 3, tx: 0, ty: 0 });
    engine.viewport.set({ scale: 4, tx: 0, ty: 0 });
    expect(renderer.world.getAttribute('transform')).toBe('matrix(1 0 0 1 0 0)');
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    expect(renderer.world.getAttribute('transform')).toBe('matrix(4 0 0 4 0 0)');
  });

  it('paints the shape being drawn, and clears it', () => {
    const { engine, renderer } = mount();
    engine.preview.set({ geometry: rectOf(0, 0, 5, 5) });
    renderer.flush();
    expect(renderer.preview.querySelector('rect')).not.toBeNull();
    engine.preview.set(null);
    renderer.flush();
    expect(renderer.preview.children).toHaveLength(0);
  });

  it('draws a selection outline and the snap indicator in screen space', () => {
    const { engine, renderer } = mount();
    const a = put(engine, rectOf(100, 100, 50, 50));
    engine.viewport.set({ scale: 2, tx: 10, ty: 10 });
    engine.selection.set([a.id]);
    engine.snapIndicator.set([100, 100]);
    renderer.flush();
    const outline = renderer.overlay.querySelector('rect.selection');
    expect(outline?.getAttribute('x')).toBe(String(210 - 4));
    expect(outline?.getAttribute('width')).toBe(String(100 + 8));
    expect(renderer.overlay.querySelector('circle.snap')?.getAttribute('cx')).toBe('210');
  });

  it('renders brush strokes as filled paths, arrows with heads, points as round dots', () => {
    const { engine, renderer } = mount();
    const free = put(engine, {
      type: 'freehand',
      points: [
        [0, 0, 0.5],
        [20, 5, 0.5],
        [40, 0, 0.5],
        [60, 10, 0.5],
      ],
    });
    const arrow = put(engine, {
      type: 'polyline',
      points: [
        [0, 0],
        [50, 0],
      ],
      arrowEnd: true,
    });
    const dot = put(engine, { type: 'point', x: 5, y: 5 });
    renderer.flush();
    expect(renderer.nodeOf(free.id)?.querySelector('path')?.getAttribute('d')).toMatch(/^M.* Z$/);
    expect(renderer.nodeOf(arrow.id)?.querySelectorAll('polyline')).toHaveLength(2);
    expect(
      renderer.nodeOf(dot.id)?.querySelector('path')?.style.getPropertyValue('stroke-linecap'),
    ).toBe('round');
  });

  it('measures text with the real font so hit testing matches what is painted', () => {
    const { engine, renderer } = mount();
    const text = put(engine, { type: 'text', x: 0, y: 0, text: 'Wide enough text', fontSize: 20 });
    renderer.flush();
    const painted = renderer.nodeOf(text.id)?.querySelector('text')?.getBBox();
    const measured = engine.index.bbox(text);
    expect(painted?.width).toBeGreaterThan(50);
    expect(measured.w).toBeCloseTo(painted?.width ?? 0, 0);
  });

  it('removes its layers on destroy', () => {
    const { renderer, svg } = mount();
    renderer.destroy();
    expect(svg.querySelector('.world')).toBeNull();
    expect(svg.querySelector('.overlay')).toBeNull();
  });
});

describe('attachInput', () => {
  it('maps pointer events to world coordinates through the viewport', () => {
    const { engine, svg, log } = mount();
    engine.viewport.set({ scale: 2, tx: 100, ty: 0 });
    pointer(svg, 'pointerdown', 300, 40);
    pointer(svg, 'pointermove', 340, 80);
    pointer(svg, 'pointerup', 340, 80);
    expect(log).toEqual(['down 100,20 mouse p0.5', 'move 120,40', 'up 120,40']);
  });

  it('reports pen pressure and ignores right-click', () => {
    const { svg, log } = mount();
    pointer(svg, 'pointerdown', 10, 10, { pointerType: 'pen', pressure: 0.8 });
    pointer(svg, 'pointerup', 10, 10, { pointerType: 'pen' });
    pointer(svg, 'pointerdown', 10, 10, { button: 2 });
    expect(log[0]).toMatch(/^down 10,10 pen p0\.8/);
    expect(log).toHaveLength(2);
  });

  it('pans with the middle button without involving the tool', () => {
    const { engine, svg, log } = mount();
    pointer(svg, 'pointerdown', 100, 100, { button: 1 });
    pointer(svg, 'pointermove', 130, 90, { button: 1 });
    pointer(svg, 'pointerup', 130, 90, { button: 1 });
    expect(engine.viewport.state.get()).toMatchObject({ tx: 30, ty: -10 });
    expect(log).toEqual([]);
  });

  it('pans with space held, then returns to the tool', () => {
    const { engine, host, svg, log } = mount();
    host.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(engine.tools.currentId).toBe('pan');
    host.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    expect(engine.tools.currentId).toBe('select');
    expect(log.filter((l) => l !== 'cancel')).toEqual([]);
    log.length = 0;
    pointer(svg, 'pointerdown', 1, 1);
    expect(log).toEqual(['down 1,1 mouse p0.5']);
  });

  it('zooms around the cursor with ctrl+wheel and pans with a plain wheel', () => {
    const { engine, svg } = mount();
    const box = svg.getBoundingClientRect();
    const world = engine.viewport.screenToWorld([200, 150]);
    svg.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -200,
        ctrlKey: true,
        clientX: box.left + 200,
        clientY: box.top + 150,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(engine.viewport.state.get().scale).toBeGreaterThan(1);
    const after = engine.viewport.screenToWorld([200, 150]);
    expect(after[0]).toBeCloseTo(world[0], 6);
    expect(after[1]).toBeCloseTo(world[1], 6);
    const before = engine.viewport.state.get();
    svg.dispatchEvent(
      new WheelEvent('wheel', { deltaX: 10, deltaY: 20, bubbles: true, cancelable: true }),
    );
    expect(engine.viewport.state.get().tx).toBe(before.tx - 10);
    expect(engine.viewport.state.get().ty).toBe(before.ty - 20);
  });

  it('does not let the page scroll while the wheel is over the canvas', () => {
    const { svg } = mount();
    const e = new WheelEvent('wheel', { deltaY: 30, bubbles: true, cancelable: true });
    svg.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('turns a second finger into pan and zoom and cancels the first finger’s tool', () => {
    const { engine, svg, log } = mount();
    pointer(svg, 'pointerdown', 300, 300, { pointerId: 1, pointerType: 'touch' });
    pointer(svg, 'pointerdown', 400, 300, { pointerId: 2, pointerType: 'touch' });
    expect(log).toContain('cancel');
    pointer(svg, 'pointermove', 250, 300, { pointerId: 1, pointerType: 'touch' });
    pointer(svg, 'pointermove', 450, 300, { pointerId: 2, pointerType: 'touch' });
    expect(engine.viewport.state.get().scale).toBeGreaterThan(1.5);
    pointer(svg, 'pointerup', 250, 300, { pointerId: 1, pointerType: 'touch' });
    pointer(svg, 'pointerup', 450, 300, { pointerId: 2, pointerType: 'touch' });
    expect(log.filter((l) => l.startsWith('up'))).toEqual([]);
  });

  it('routes shortcuts from the host and skips them while typing', () => {
    const { engine, host } = mount();
    const a = put(engine, rectOf(0, 0, 10, 10));
    engine.selection.set([a.id]);
    const input = document.createElement('input');
    host.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(engine.store.list.get()).toHaveLength(1);
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
    );
    expect(engine.store.list.get()).toHaveLength(0);
  });

  it('forwards double clicks', () => {
    const { svg, log } = mount();
    svg.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(log).toContain('dblclick');
  });

  it('detaches every listener', () => {
    const { svg, log } = mount();
    for (const c of cleanups.splice(0)) c();
    pointer(svg, 'pointerdown', 1, 1);
    expect(log).toEqual([]);
  });
});
