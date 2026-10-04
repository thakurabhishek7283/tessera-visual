import '@tessera-kit/elements/define';
import { cleanup, until } from '@tessera-internal/test-utils';
import { TesseraProvider } from '@tessera-kit/react';
import { createTestInstance } from '@tessera-kit/testing';
import { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TesseraAnnotatorElement } from '../src/elements/index.js';
import {
  AnnotationList,
  Annotator,
  useAnnotations,
  useAnnotatorApi,
  useAnnotatorHandle,
  useSelection,
  Whiteboard,
} from '../src/react/index.js';

afterEach(cleanup);

function image(): string {
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 200;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#dde6f1';
  g.fillRect(0, 0, 300, 200);
  return c.toDataURL('image/png');
}

async function world() {
  const { instance } = await createTestInstance(
    { features: { annotator: { enabled: true } } },
    { annotator: () => import('../src/plugin.js') },
  );
  const container = document.createElement('div');
  container.style.width = '800px';
  document.body.append(container);
  return { instance, container, root: createRoot(container) };
}

describe('React annotator bindings', () => {
  it('<Annotator> opens the image, and reports readiness and new shapes', async () => {
    const { instance, container, root } = await world();
    const src = image();
    const onReady = vi.fn();
    const onCreate = vi.fn();
    root.render(
      <TesseraProvider instance={instance}>
        <Annotator src={src} setId="react-1" onReady={onReady} onAnnotationCreate={onCreate} />
      </TesseraProvider>,
    );
    await until(() => onReady.mock.calls.length === 1);
    const handle = onReady.mock.calls[0]?.[0].detail.handle;
    handle.setTool('rect');
    const el = container.querySelector('tessera-annotator') as TesseraAnnotatorElement;
    const svg = el.shadowRoot?.querySelector('.canvas svg') as SVGSVGElement;
    const box = svg.getBoundingClientRect();
    const fire = (type: string, x: number, y: number): boolean =>
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
    fire('pointerdown', 40, 40);
    fire('pointermove', 120, 90);
    fire('pointerup', 120, 90);
    await until(() => handle.annotations.get().length === 1);
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate.mock.calls[0]?.[0].detail.annotation.geometry.type).toBe('rect');
  });

  it('passes the readonly attribute and the config property through', async () => {
    const { instance, container, root } = await world();
    const onReady = vi.fn();
    root.render(
      <TesseraProvider instance={instance}>
        <Annotator
          src={image()}
          setId="react-2"
          readonly
          noPanel
          config={{ tools: ['select', 'rect'], persistence: 'none' }}
          onReady={onReady}
        />
      </TesseraProvider>,
    );
    await until(() => onReady.mock.calls.length === 1);
    const handle = onReady.mock.calls[0]?.[0].detail.handle;
    expect(handle.config).toMatchObject({
      readOnly: true,
      tools: ['select', 'rect'],
      persistence: 'none',
    });
    expect(
      container
        .querySelector('tessera-annotator')
        ?.shadowRoot?.querySelector('tessera-annotation-list'),
    ).toBeNull();
  });

  it('hooks follow the handle, its annotations and the selection', async () => {
    const { instance, container, root } = await world();
    function Panel() {
      const ref = useRef<TesseraAnnotatorElement>(null);
      const handle = useAnnotatorHandle(ref);
      const list = useAnnotations(handle);
      const selected = useSelection(handle);
      const api = useAnnotatorApi();
      return (
        <div>
          <Annotator ref={ref} src={image()} setId="react-3" noPanel />
          <output id="count">{`${list.length}/${selected.length}/${api ? 'api' : 'none'}`}</output>
          <button type="button" onClick={() => handle?.select([list[0]?.id ?? ''])}>
            select first
          </button>
        </div>
      );
    }
    root.render(
      <TesseraProvider instance={instance}>
        <Panel />
      </TesseraProvider>,
    );
    const out = () => container.querySelector('#count')?.textContent;
    await until(() => out()?.endsWith('/api'));
    const el = container.querySelector('tessera-annotator') as TesseraAnnotatorElement;
    await until(() => el.handle);
    el.handle?.add({ geometry: { type: 'point', x: 5, y: 5 }, bodies: [] });
    await until(() => out() === '1/0/api');
    container.querySelector('button')?.click();
    await until(() => out() === '1/1/api');
  });

  it('<Whiteboard> and a separate <AnnotationList for> work together', async () => {
    const { instance, container, root } = await world();
    const onReady = vi.fn();
    root.render(
      <TesseraProvider instance={instance}>
        <Whiteboard id="wb" boardId="react-wb" noPanel onReady={onReady} />
        <AnnotationList for="wb" />
      </TesseraProvider>,
    );
    await until(() => onReady.mock.calls.length === 1);
    onReady.mock.calls[0]?.[0].detail.handle.add({
      geometry: { type: 'rect', x: 0, y: 0, w: 10, h: 10 },
      bodies: [],
    });
    const list = container.querySelector('tessera-annotation-list') as HTMLElement;
    await until(() => list.shadowRoot?.querySelectorAll('.row').length === 1);
  });
});
