import type { AnnotatorEngine } from '../engine/engine.js';
import { ellipseTool, rectTool } from './drag-shape.js';

/** Registers every built-in tool; which of them are offered is up to the config. */
export function registerDefaultTools(engine: AnnotatorEngine): void {
  for (const tool of [rectTool(), ellipseTool()]) {
    engine.tools.register(tool);
  }
}
