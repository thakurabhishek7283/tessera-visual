import type { AnnotatorEngine } from '../engine/engine.js';
import { ellipseTool, rectTool } from './drag-shape.js';
import { freehandTool } from './freehand.js';
import { arrowTool, polygonTool, polylineTool } from './path.js';
import { pointTool } from './point.js';
import { selectTool } from './select.js';
import { textTool } from './text.js';

/** Registers every built-in tool; which of them are offered is up to the config. */
export function registerDefaultTools(engine: AnnotatorEngine): void {
  for (const tool of [
    selectTool(),
    rectTool(),
    ellipseTool(),
    polygonTool(),
    polylineTool(),
    arrowTool(),
    freehandTool(),
    pointTool(),
    textTool(),
  ]) {
    engine.tools.register(tool);
  }
}
