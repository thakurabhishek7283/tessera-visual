import { createIdGenerator } from '@tessera/core';
import { createFakeClock, type FakeClock } from '@tessera/testing';
import type { ToolId } from '../src/config.js';
import { AnnotatorConfig, type AnnotatorConfigValue } from '../src/config.js';
import { AnnotatorEngine, type SurfaceMode } from '../src/engine/engine.js';
import type { KeyInput, NormalizedPointer } from '../src/engine/tools.js';
import type { Annotation, Geometry, Point } from '../src/geometry/model.js';
import { registerDefaultTools } from '../src/tools/index.js';

export function ptr(
  x: number,
  y: number,
  over: Partial<NormalizedPointer> = {},
): NormalizedPointer {
  return {
    world: [x, y],
    screen: [x, y],
    pressure: 0.5,
    shift: false,
    alt: false,
    mod: false,
    button: 0,
    pointerType: 'mouse',
    ...over,
  };
}

export const key = (k: string, over: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  shift: false,
  alt: false,
  mod: false,
  ...over,
});

export interface TestEngine {
  engine: AnnotatorEngine;
  clock: FakeClock;
}

/** An engine at scale 1 with its tools registered, in a 800×600 view. */
export function makeEngine(
  config: Partial<AnnotatorConfigValue> = {},
  mode: SurfaceMode = 'image',
  register?: (engine: AnnotatorEngine) => void,
): TestEngine {
  const clock = createFakeClock();
  const engine = new AnnotatorEngine({
    mode,
    config: AnnotatorConfig.parse({ enabled: true, ...config }),
    clock,
    ids: createIdGenerator({ clock }),
    user: () => 'alice',
  });
  engine.viewport.setSize(800, 600);
  engine.viewport.set({ scale: 1, tx: 0, ty: 0 });
  register?.(engine);
  return { engine, clock };
}

export const rectOf = (x: number, y: number, w: number, h: number): Geometry => ({
  type: 'rect',
  x,
  y,
  w,
  h,
});

/** Adds a shape straight to the store (bypassing tools) and returns it. */
export function put(
  engine: AnnotatorEngine,
  geometry: Geometry,
  extra: Partial<Annotation> = {},
): Annotation {
  const [a] = engine.store.add([{ geometry, ...extra }]);
  if (!a) throw new Error('add failed');
  return a;
}

export const pts = (...p: Array<[number, number]>): Point[] => p;

export const ALL_TOOLS: ToolId[] = [
  'select',
  'pan',
  'rect',
  'ellipse',
  'polygon',
  'polyline',
  'arrow',
  'freehand',
  'point',
  'text',
  'eraser',
];

/** An engine with every real tool registered and enabled. */
export function toolEngine(
  config: Partial<AnnotatorConfigValue> = {},
  mode: SurfaceMode = 'image',
): TestEngine {
  return makeEngine({ tools: ALL_TOOLS, ...config }, mode, registerDefaultTools);
}

/** A pointer at a world position, with screen coordinates derived from the viewport. */
export function at(
  engine: AnnotatorEngine,
  x: number,
  y: number,
  over: Partial<NormalizedPointer> = {},
): NormalizedPointer {
  const screen = engine.viewport.worldToScreen([x, y]);
  return ptr(x, y, { screen, ...over });
}

/** Press, move through the given points and release at the last one. */
export function drag(
  engine: AnnotatorEngine,
  from: Point,
  ...rest: Array<Point | [number, number, Partial<NormalizedPointer>]>
): void {
  const mods = (rest.at(-1) as [number, number, Partial<NormalizedPointer>] | undefined)?.[2] ?? {};
  engine.tools.pointerDown(at(engine, from[0], from[1], mods));
  for (const p of rest) engine.tools.pointerMove(at(engine, p[0], p[1], mods));
  const last = rest.at(-1) ?? from;
  engine.tools.pointerUp(at(engine, last[0], last[1], mods));
}

export function click(
  engine: AnnotatorEngine,
  x: number,
  y: number,
  over: Partial<NormalizedPointer> = {},
): void {
  engine.tools.pointerDown(at(engine, x, y, over));
  engine.tools.pointerUp(at(engine, x, y, over));
}
