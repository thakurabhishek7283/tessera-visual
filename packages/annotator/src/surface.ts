import { type TesseraContext, TesseraError } from '@tessera/core';
import { AnnotatorConfig, type AnnotatorConfigValue } from './config.js';
import { AnnotatorEngine } from './engine/engine.js';
import { attachInput } from './engine/input.js';
import { Renderer } from './engine/renderer.js';
import { unionRect } from './geometry/bbox.js';
import type { Rect } from './geometry/model.js';
import { renderPng } from './interop/export-png.js';
import { exportW3C, importW3C } from './interop/w3c.js';
import { SetPersistence, setDocId } from './persistence.js';
import { registerDefaultTools } from './tools/index.js';
import type { AnnotatorHandle, AnnotatorOptions } from './types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BOARD_PADDING = 40;

function loadImage(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () =>
      reject(new TesseraError('NOT_FOUND', `The image could not be loaded: ${src}`));
    img.src = src;
  });
}

/** What an element needs besides the public handle. */
export interface Surface {
  handle: AnnotatorHandle;
  engine: AnnotatorEngine;
}

/**
 * Builds an annotator inside `host`: engine, SVG renderer, pointer and keyboard input, resizing,
 * the stored set and the public handle.
 */
export async function createSurface(
  ctx: TesseraContext,
  featureConfig: AnnotatorConfigValue,
  host: HTMLElement,
  opts: AnnotatorOptions,
): Promise<Surface> {
  const config = AnnotatorConfig.parse({ ...featureConfig, ...opts.config, enabled: true });
  if (opts.mode === 'image' && !opts.src) {
    throw new TesseraError('VALIDATION', 'An image annotator needs `src`');
  }
  const source = opts.mode === 'image' ? (opts.src as string) : `board:${opts.setId ?? 'default'}`;
  const docId = setDocId(source, opts.setId);

  const engine = new AnnotatorEngine({
    mode: opts.mode,
    config,
    clock: ctx.clock,
    ids: ctx.ids,
    user: () => ctx.auth.getUser()?.id,
  });
  registerDefaultTools(engine);
  if (opts.hooks) engine.hooks = opts.hooks;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    opts.alt ?? (opts.mode === 'image' ? 'Annotated image' : 'Whiteboard'),
  );
  svg.style.cssText =
    'display:block;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none;';
  host.append(svg);
  if (!host.hasAttribute('tabindex')) host.tabIndex = 0;

  const renderer = new Renderer(engine, svg);
  if (opts.mode === 'board') renderer.setGrid();
  const detach = attachInput(engine, svg, host);
  const offCursor = engine.cursor.subscribe((c) => {
    svg.style.cursor = c;
  });

  // Fit once, as soon as both the view and (for an image) its size are known.
  let fitted = false;
  const fitWhenReady = (): void => {
    if (fitted || engine.viewport.size.get().w <= 0) return;
    if (opts.mode === 'image' && !engine.surface.get()) return;
    fitted = true;
    engine.fit();
  };
  const measure = (): void => {
    const box = host.getBoundingClientRect();
    engine.viewport.setSize(box.width, box.height);
    fitWhenReady();
  };
  const observer = new ResizeObserver(measure);
  observer.observe(host);
  measure();

  let persistence: SetPersistence | undefined;
  const teardown = (): void => {
    observer.disconnect();
    detach();
    offCursor();
    renderer.destroy();
    svg.remove();
    engine.destroy();
  };

  try {
    if (opts.mode === 'image') {
      const size = await loadImage(opts.src as string);
      renderer.setImage({ href: opts.src as string, ...size });
      engine.setSurface(size);
      fitWhenReady();
    }
    if (config.persistence === 'storage') {
      persistence = new SetPersistence({ ctx, engine, source, setId: opts.setId });
      await persistence.start();
    }
  } catch (error) {
    teardown();
    throw error;
  }

  const exportRect = (): Rect => {
    if (opts.mode === 'image') return engine.contentRect();
    const boxes = engine.annotations
      .get()
      .filter((a) => !a.hidden)
      .map((a) => engine.index.bbox(a));
    const content = boxes.length > 0 ? boxes.reduce(unionRect) : engine.contentRect();
    return {
      x: content.x - BOARD_PADDING,
      y: content.y - BOARD_PADDING,
      w: content.w + BOARD_PADDING * 2,
      h: content.h + BOARD_PADDING * 2,
    };
  };

  let destroyed = false;
  const handle: AnnotatorHandle = {
    mode: opts.mode,
    config,
    source,
    setId: docId,
    annotations: engine.annotations,
    selection: engine.selection.ids,
    tool: engine.tools.active,
    history: engine.history,
    view: engine.viewport.state,
    drawStyle: engine.drawStyle,
    setTool: (id) => {
      engine.tools.setTool(id);
    },
    add: (a) => {
      const [created] = engine.store.add([a]);
      if (!created) throw new TesseraError('UNKNOWN', 'The annotation could not be added');
      return created;
    },
    update: (id, patch) => engine.update(id, patch),
    remove: (ids) => {
      engine.store.remove(ids);
    },
    select: (ids) => engine.selection.set(ids),
    fit: () => engine.fit(),
    zoomBy: (factor) => engine.viewport.zoomBy(factor),
    zoomTo: (id) => engine.zoomTo(id),
    setVisible: (id, visible) => engine.update(id, { hidden: !visible }),
    exportW3C: () => exportW3C(engine.annotations.get(), source),
    importW3C: (list, mode) => {
      const { annotations, warnings } = importW3C(list);
      engine.store.importItems(annotations, mode);
      return warnings;
    },
    exportPNG: async () => {
      const style = getComputedStyle(host);
      const rect = exportRect();
      const { blob, warnings } = await renderPng({
        rect,
        annotations: engine.annotations.get(),
        strokesScale: engine.strokeScales,
        strokeFactor: engine.strokeScales ? 1 : 1 / Math.max(engine.viewport.fitScale(rect), 0.01),
        brush: config.freehand,
        image: opts.mode === 'image' ? (opts.src as string) : null,
        ...(opts.mode === 'board'
          ? { background: style.getPropertyValue('--tessera-color-bg').trim() || '#ffffff' }
          : {}),
        readVar: (name) => style.getPropertyValue(name).trim(),
      });
      for (const w of warnings) ctx.logger.warn(w);
      return blob;
    },
    on: (_event, fn) => engine.events.on('changed', fn),
    destroy: async () => {
      if (destroyed) return;
      destroyed = true;
      await persistence?.destroy();
      teardown();
    },
  };
  return { handle, engine };
}
