import '@tessera/elements/define';
import '../src/elements/index.js';
import {
  cleanup,
  expectAccessible,
  mountInstance,
  must,
  settle,
  until,
} from '@tessera-internal/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TesseraAnnotatorElement, TesseraWhiteboardElement } from '../src/elements/index.js';

afterEach(cleanup);

type Surface = TesseraAnnotatorElement | TesseraWhiteboardElement;

function image(w = 400, h = 300): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#d9e2ef';
  g.fillRect(0, 0, w, h);
  return c.toDataURL('image/png');
}

async function mountAnnotator(markup: string, features: Record<string, unknown> = {}) {
  const { root, instance } = await mountInstance(
    { features: { annotator: { enabled: true, ...features } } },
    { annotator: () => import('../src/plugin.js') },
  );
  const holder = document.createElement('div');
  holder.style.cssText = 'width:900px';
  root.append(holder);
  holder.innerHTML = markup;
  const el = must(holder.firstElementChild as Surface);
  await settle(el);
  await until(() => el.handle);
  await settle(el);
  return { root, instance, el, handle: must(el.handle) };
}

const svgOf = (el: Element): SVGSVGElement =>
  must(el.shadowRoot?.querySelector('.canvas svg')) as SVGSVGElement;

function pointer(
  svg: Element,
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {},
): void {
  const box = svg.getBoundingClientRect();
  svg.dispatchEvent(
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
}

const drag = (svg: Element, from: [number, number], to: [number, number]): void => {
  pointer(svg, 'pointerdown', ...from);
  pointer(svg, 'pointermove', ...to);
  pointer(svg, 'pointerup', ...to);
};

const tool = (el: Element, id: string): HTMLButtonElement =>
  must(
    el.shadowRoot
      ?.querySelector('tessera-annotator-toolbar')
      ?.shadowRoot?.querySelector<HTMLButtonElement>(`[data-tool=${id}]`),
  );

describe('<tessera-annotator>', () => {
  it('opens the image, shows the toolbar and the (empty) list, and is accessible', async () => {
    const { el } = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="e1"></tessera-annotator>`,
    );
    expect(svgOf(el).querySelector('.background image')).not.toBeNull();
    const toolbar = must(el.shadowRoot?.querySelector('tessera-annotator-toolbar'));
    expect(toolbar.shadowRoot?.querySelectorAll('[data-tool]').length).toBeGreaterThan(5);
    const list = must(el.shadowRoot?.querySelector('tessera-annotation-list'));
    expect(list.shadowRoot?.textContent).toContain('Nothing has been drawn yet');
    await expectAccessible(el);
  });

  it('draws with the toolbar tool, lists the shape and describes it in words', async () => {
    const { el, handle } = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="e2"></tessera-annotator>`,
    );
    tool(el, 'rect').click();
    await until(() => tool(el, 'rect').getAttribute('aria-pressed') === 'true');
    drag(svgOf(el), [100, 80], [220, 170]);
    await until(() => handle.annotations.get().length === 1);
    await settle(el);
    const list = must(el.shadowRoot?.querySelector('tessera-annotation-list'));
    const row = must(list.shadowRoot?.querySelector('.row'));
    expect(row.textContent).toContain('Rectangle at');
    expect(row.getAttribute('aria-pressed')).toBe('true');
    await expectAccessible(el);
  });

  it('fires annotation-create (cancelable), annotation-update, annotation-delete and selection-change', async () => {
    const { el, handle } = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="e3"></tessera-annotator>`,
    );
    const seen: string[] = [];
    for (const name of [
      'annotation-create',
      'annotation-update',
      'annotation-delete',
      'selection-change',
    ]) {
      el.addEventListener(name, () => seen.push(name));
    }
    tool(el, 'rect').click();
    drag(svgOf(el), [50, 50], [150, 120]);
    await until(() => handle.annotations.get().length === 1);
    const id = must(handle.annotations.get()[0]).id;
    handle.update(id, { locked: true });
    handle.remove([id]);
    // Deleting a selected shape first clears it from the selection, then reports the deletion.
    expect(seen).toEqual([
      'annotation-create',
      'selection-change',
      'annotation-update',
      'selection-change',
      'annotation-delete',
    ]);
  });

  it('lets the host cancel annotation-create', async () => {
    const { el, handle } = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="e4"></tessera-annotator>`,
    );
    el.addEventListener('annotation-create', (e) => e.preventDefault());
    tool(el, 'rect').click();
    drag(svgOf(el), [50, 50], [150, 120]);
    await new Promise((r) => setTimeout(r, 50));
    expect(handle.annotations.get()).toEqual([]);
  });

  it('asks for a label when one is required, and discards the shape when cancelled', async () => {
    const { el, handle } = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="e5"></tessera-annotator>`,
      {
        requireLabel: true,
        labels: [
          { value: 'tent', color: 'green' },
          { value: 'fire pit', color: 'red' },
        ],
      },
    );
    tool(el, 'rect').click();
    drag(svgOf(el), [60, 60], [160, 140]);
    const picker = await until(() => el.shadowRoot?.querySelector('tessera-label-picker'));
    await settle(picker);
    expect(picker.shadowRoot?.querySelector('[role=dialog]')).not.toBeNull();
    await expectAccessible(picker);
    const options = [...(picker.shadowRoot?.querySelectorAll<HTMLButtonElement>('.option') ?? [])];
    expect(options.map((o) => o.textContent?.trim())).toEqual(['tent', 'fire pit']);
    options[1]?.click();
    await until(() => handle.annotations.get().length === 1);
    expect(handle.annotations.get()[0]).toMatchObject({
      bodies: [{ purpose: 'tagging', value: 'fire pit' }],
      style: { stroke: 'red' },
    });

    drag(svgOf(el), [200, 60], [300, 140]);
    const second = await until(() => el.shadowRoot?.querySelector('tessera-label-picker'));
    await settle(second);
    second.shadowRoot
      ?.querySelector('[role=dialog]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => !el.shadowRoot?.querySelector('tessera-label-picker'));
    expect(handle.annotations.get()).toHaveLength(1);
  });

  it('accepts a free-text label in the picker', async () => {
    const { el, handle } = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="e6"></tessera-annotator>`,
      { requireLabel: true },
    );
    tool(el, 'ellipse').click();
    drag(svgOf(el), [60, 60], [160, 140]);
    const picker = await until(() => el.shadowRoot?.querySelector('tessera-label-picker'));
    await settle(picker);
    const input = must(picker.shadowRoot?.querySelector<HTMLInputElement>('input'));
    input.value = 'picnic table';
    input.dispatchEvent(new Event('input'));
    await settle(picker);
    must(picker.shadowRoot?.querySelector<HTMLFormElement>('form')).requestSubmit();
    await until(() => handle.annotations.get().length === 1);
    expect(handle.annotations.get()[0]?.bodies[0]?.value).toBe('picnic table');
  });

  it('writes text in place with the text tool', async () => {
    const { el, handle } = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="e7"></tessera-annotator>`,
      { tools: ['select', 'text'] },
    );
    tool(el, 'text').click();
    pointer(svgOf(el), 'pointerdown', 120, 90);
    pointer(svgOf(el), 'pointerup', 120, 90);
    const area = await until(() =>
      el.shadowRoot?.querySelector<HTMLTextAreaElement>('.text-editor'),
    );
    area.value = 'Fire pit here';
    area.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await until(() => handle.annotations.get().length === 1);
    expect(handle.annotations.get()[0]?.geometry).toMatchObject({
      type: 'text',
      text: 'Fire pit here',
    });
    expect(el.shadowRoot?.querySelector('.text-editor')).toBeNull();
  });

  it('reflects read-only: no drawing tools, no undo, nothing changes', async () => {
    const { el, handle } = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="e8" readonly></tessera-annotator>`,
    );
    const toolbar = must(el.shadowRoot?.querySelector('tessera-annotator-toolbar'));
    const ids = [...(toolbar.shadowRoot?.querySelectorAll('[data-tool]') ?? [])].map((b) =>
      b.getAttribute('data-tool'),
    );
    expect(ids).toEqual(['select']);
    expect(toolbar.shadowRoot?.querySelector('[aria-label=Undo]')).toBeNull();
    expect(handle.config.readOnly).toBe(true);
  });

  it('hides itself and closes the surface when the feature is disabled, and returns when enabled', async () => {
    const { el, instance } = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="e9"></tessera-annotator>`,
    );
    await instance.disable('annotator');
    await until(() => el.hasAttribute('hidden') && !el.handle);
    await instance.enable('annotator');
    await until(() => el.handle);
    expect(el.hasAttribute('hidden')).toBe(false);
  });

  it('reports an image that cannot be loaded', async () => {
    const { root } = await mountInstance(
      { features: { annotator: { enabled: true } } },
      { annotator: () => import('../src/plugin.js') },
    );
    root.innerHTML =
      '<tessera-annotator src="data:image/png;base64,AAAA" set-id="bad"></tessera-annotator>';
    const el = must(root.firstElementChild as TesseraAnnotatorElement);
    const alert = await until(() => el.shadowRoot?.querySelector('[role=alert]'));
    expect(alert.textContent).toContain('could not be loaded');
  });

  it('follows the language of the instance', async () => {
    const { el, instance } = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="e10"></tessera-annotator>`,
    );
    instance.setLocale('de');
    await until(() =>
      el.shadowRoot
        ?.querySelector('tessera-annotator-toolbar')
        ?.shadowRoot?.textContent?.includes('Rechteck'),
    );
    expect(
      must(el.shadowRoot?.querySelector('tessera-annotation-list')).shadowRoot?.textContent,
    ).toContain('noch nichts gezeichnet');
  });

  it('is usable with the keyboard: tool hotkeys on the canvas and arrow keys in the toolbar', async () => {
    const { el, handle } = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="e11"></tessera-annotator>`,
    );
    const canvas = must(el.shadowRoot?.querySelector<HTMLElement>('.canvas'));
    canvas.focus();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    expect(handle.tool.get()).toBe('ellipse');
    const first = tool(el, 'select');
    const toolbar = must(el.shadowRoot?.querySelector('tessera-annotator-toolbar'));
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(toolbar.shadowRoot?.activeElement?.getAttribute('data-tool')).not.toBe('select');
  });
});

describe('<tessera-annotation-list>', () => {
  async function withShapes() {
    const ctx = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="l1" no-panel id="a"></tessera-annotator><tessera-annotation-list for="a"></tessera-annotation-list>`,
      {
        labels: [
          { value: 'tent', color: 'green' },
          { value: 'fire pit', color: 'red' },
        ],
      },
    );
    const holder = must(ctx.el.parentElement);
    const list = must(holder.querySelector('tessera-annotation-list'));
    ctx.handle.add({
      geometry: { type: 'rect', x: 10, y: 10, w: 60, h: 40 },
      bodies: [{ purpose: 'tagging', value: 'tent' }],
    });
    ctx.handle.add({ geometry: { type: 'point', x: 200, y: 100 }, bodies: [] });
    await settle(list);
    await until(() => list.shadowRoot?.querySelectorAll('.row').length === 2);
    return { ...ctx, list };
  }

  it('works standalone through `for`, topmost first, with a name and a description', async () => {
    const { list } = await withShapes();
    const rows = [...(list.shadowRoot?.querySelectorAll('.row') ?? [])];
    expect(rows[0]?.textContent).toContain('No label');
    expect(rows[0]?.textContent).toContain('Point at 200, 100');
    expect(rows[1]?.textContent).toContain('tent');
    expect(rows[1]?.textContent).toContain('Rectangle at 10, 10, 60×40');
    await expectAccessible(list);
  });

  it('selects on the canvas when a row is chosen, extending with ctrl', async () => {
    const { list, handle } = await withShapes();
    const rows = [...(list.shadowRoot?.querySelectorAll<HTMLButtonElement>('.row') ?? [])];
    rows[1]?.click();
    expect(handle.selection.get()).toEqual([rows[1]?.dataset.id]);
    rows[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(handle.selection.get()).toHaveLength(2);
  });

  it('moves between rows with the arrow keys and deletes with Delete, keeping focus in the list', async () => {
    const { list, handle } = await withShapes();
    const rows = () => [...(list.shadowRoot?.querySelectorAll<HTMLButtonElement>('.row') ?? [])];
    rows()[0]?.focus();
    rows()[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(list.shadowRoot?.activeElement).toBe(rows()[1]);
    rows()[1]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
    );
    await until(() => rows().length === 1);
    expect(handle.annotations.get()).toHaveLength(1);
    await until(() => list.shadowRoot?.activeElement === rows()[0]);
  });

  it('edits the label, note, visibility and lock of the selected shape', async () => {
    const { list, handle } = await withShapes();
    const first = must(list.shadowRoot?.querySelectorAll<HTMLButtonElement>('.row')[1]);
    first.click();
    await settle(list);
    const root = must(list.shadowRoot);
    const label = must(root.querySelector<HTMLInputElement>('input[type=text]'));
    label.value = 'fire pit';
    label.dispatchEvent(new Event('change'));
    const id = must(first.dataset.id);
    expect(handle.annotations.get().find((a) => a.id === id)).toMatchObject({
      bodies: [{ purpose: 'tagging', value: 'fire pit' }],
      style: { stroke: 'red' },
    });
    await settle(list);
    const note = must(root.querySelector<HTMLTextAreaElement>('textarea'));
    note.value = 'Next to the lake';
    note.dispatchEvent(new Event('change'));
    expect(
      handle.annotations
        .get()
        .find((a) => a.id === id)
        ?.bodies.at(-1),
    ).toEqual({ purpose: 'commenting', value: 'Next to the lake' });
    await settle(list);
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.actions .btn')];
    buttons.find((b) => b.textContent?.includes('Hide'))?.click();
    expect(handle.annotations.get().find((a) => a.id === id)?.hidden).toBe(true);
    await settle(list);
    [...root.querySelectorAll<HTMLButtonElement>('.actions .btn')]
      .find((b) => b.textContent?.includes('Lock'))
      ?.click();
    expect(handle.annotations.get().find((a) => a.id === id)?.locked).toBe(true);
    await settle(list);
    expect(root.querySelector<HTMLInputElement>('input[type=text]')?.disabled).toBe(true);
    await expectAccessible(list);
  });

  it('uses a select when labels are fixed', async () => {
    const ctx = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="l2"></tessera-annotator>`,
      { labels: [{ value: 'tent', color: 'green' }], allowFreeTextLabels: false },
    );
    ctx.handle.add({ geometry: { type: 'point', x: 5, y: 5 }, bodies: [] });
    const list = must(ctx.el.shadowRoot?.querySelector('tessera-annotation-list'));
    await until(() => list.shadowRoot?.querySelector('.row'));
    must(list.shadowRoot?.querySelector<HTMLButtonElement>('.row')).click();
    await settle(list);
    const select = must(list.shadowRoot?.querySelector<HTMLSelectElement>('select'));
    expect([...select.options].map((o) => o.value)).toEqual(['', 'tent']);
    select.value = 'tent';
    select.dispatchEvent(new Event('change'));
    expect(ctx.handle.annotations.get()[0]?.bodies[0]?.value).toBe('tent');
  });

  it('hides it all in read-only mode', async () => {
    const ctx = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="l3" readonly></tessera-annotator>`,
    );
    ctx.handle.add({ geometry: { type: 'point', x: 5, y: 5 }, bodies: [] });
    const list = must(ctx.el.shadowRoot?.querySelector('tessera-annotation-list'));
    await until(() => list.shadowRoot?.querySelector('.row'));
    must(list.shadowRoot?.querySelector<HTMLButtonElement>('.row')).click();
    await settle(list);
    expect(list.shadowRoot?.querySelector('.btn.danger')).toBeNull();
    expect(list.shadowRoot?.querySelector('textarea')?.disabled).toBe(true);
  });
});

describe('<tessera-whiteboard>', () => {
  it('opens a board with a grid and colour and width pickers that style what is drawn', async () => {
    const { el, handle } = await mountAnnotator(
      '<tessera-whiteboard board-id="w1"></tessera-whiteboard>',
    );
    expect(svgOf(el).querySelector('.background pattern')).not.toBeNull();
    const toolbar = must(el.shadowRoot?.querySelector('tessera-annotator-toolbar'));
    const red = must(toolbar.shadowRoot?.querySelector<HTMLButtonElement>('[data-color=red]'));
    red.click();
    toolbar.shadowRoot?.querySelector<HTMLButtonElement>('[data-width=thick]')?.click();
    expect(handle.drawStyle.get()).toMatchObject({ stroke: 'red', strokeWidth: 8 });
    tool(el, 'rect').click();
    drag(svgOf(el), [100, 100], [220, 180]);
    await until(() => handle.annotations.get().length === 1);
    expect(handle.annotations.get()[0]?.style).toMatchObject({ stroke: 'red', strokeWidth: 8 });
    await settle(el);
    await expectAccessible(el);
  });

  it('applies a colour change to the selected shapes too', async () => {
    const { el, handle } = await mountAnnotator(
      '<tessera-whiteboard board-id="w2"></tessera-whiteboard>',
    );
    const a = handle.add({
      geometry: { type: 'rect', x: 0, y: 0, w: 50, h: 50 },
      bodies: [],
      style: { stroke: 'blue' },
    });
    handle.select([a.id]);
    const toolbar = must(el.shadowRoot?.querySelector('tessera-annotator-toolbar'));
    await settle(toolbar);
    toolbar.shadowRoot?.querySelector<HTMLButtonElement>('[data-color=green]')?.click();
    expect(handle.annotations.get()[0]?.style?.stroke).toBe('green');
  });

  it('draws freehand strokes', async () => {
    const { el, handle } = await mountAnnotator(
      '<tessera-whiteboard board-id="w3"></tessera-whiteboard>',
    );
    tool(el, 'freehand').click();
    const svg = svgOf(el);
    pointer(svg, 'pointerdown', 100, 100);
    for (let i = 1; i <= 8; i++) pointer(svg, 'pointermove', 100 + i * 15, 100 + Math.sin(i) * 20);
    pointer(svg, 'pointerup', 220, 110);
    await until(() => handle.annotations.get().length === 1);
    expect(handle.annotations.get()[0]?.geometry.type).toBe('freehand');
    await vi.waitFor(() => expect(svg.querySelector('.shapes path')).not.toBeNull());
  });
});

describe('<tessera-annotator-minimap>', () => {
  const minimapOf = (el: Element) => el.shadowRoot?.querySelector('tessera-annotator-minimap');

  it('is off unless asked for', async () => {
    const { el } = await mountAnnotator(
      `<tessera-annotator src="${image()}" set-id="m0"></tessera-annotator>`,
    );
    expect(minimapOf(el)).toBeNull();
  });

  it('shows the shapes and the visible part, and follows panning', async () => {
    const { el, handle } = await mountAnnotator(
      `<tessera-annotator src="${image(1200, 800)}" set-id="m1" no-panel></tessera-annotator>`,
      { minimap: true },
    );
    handle.add({ geometry: { type: 'rect', x: 100, y: 100, w: 200, h: 100 }, bodies: [] });
    handle.add({ geometry: { type: 'point', x: 600, y: 400 }, bodies: [] });
    const minimap = await until(() => minimapOf(el));
    await settle(minimap);
    const root = must(minimap.shadowRoot);
    await until(() => root.querySelectorAll('rect.shape').length === 2);
    expect(root.querySelector('image')).not.toBeNull();
    expect(root.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    // Zoomed in, only a part of the image is visible, and the outline says which.
    handle.zoomBy(3);
    await settle(minimap);
    const view = must(root.querySelector('rect.view'));
    const before = Number(view.getAttribute('x'));
    handle.panTo(1000, 700);
    await settle(minimap);
    expect(Number(view.getAttribute('x'))).toBeGreaterThan(before);
    await expectAccessible(el);
  });

  it('moves the view where it is pressed', async () => {
    const { el, handle } = await mountAnnotator(
      `<tessera-annotator src="${image(1200, 800)}" set-id="m2" no-panel></tessera-annotator>`,
      { minimap: true },
    );
    handle.zoomBy(4);
    const minimap = await until(() => minimapOf(el));
    await settle(minimap);
    const svg = must(minimap.shadowRoot?.querySelector('svg')) as SVGSVGElement;
    const box = svg.getBoundingClientRect();
    // A press at the top-left quarter of the picture centres the view on the matching world point.
    svg.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: box.left + box.width * 0.25,
        clientY: box.top + box.height * 0.25,
        pointerId: 1,
        pointerType: 'mouse',
        buttons: 1,
      }),
    );
    const { scale, tx, ty } = handle.view.get();
    const { w, h } = handle.viewSize.get();
    const centre = [(w / 2 - tx) / scale, (h / 2 - ty) / scale];
    expect(centre[0]).toBeLessThan(450);
    expect(centre[1]).toBeLessThan(300);
    expect(centre[0]).toBeGreaterThan(150);
  });
});
