import { createIdGenerator } from '@tessera/core';
import { createFakeClock, type FakeClock } from '@tessera/testing';
import { AnnotatorConfig, type AnnotatorConfigValue } from '../src/config.js';
import { AnnotatorEngine, type SurfaceMode } from '../src/engine/engine.js';
import type { KeyInput, NormalizedPointer } from '../src/engine/tools.js';
import type { Annotation, Geometry, Point } from '../src/geometry/model.js';

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
