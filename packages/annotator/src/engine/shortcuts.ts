import type { ToolId } from '../config.js';
import type { AnnotatorEngine } from './engine.js';
import type { KeyInput } from './tools.js';

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'select',
  h: 'pan',
  r: 'rect',
  e: 'ellipse',
  p: 'polygon',
  l: 'polyline',
  a: 'arrow',
  d: 'freehand',
  o: 'point',
  t: 'text',
  x: 'eraser',
};

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Keyboard commands that are not tool business: tool hotkeys, undo/redo, zoom, delete, duplicate,
 * select all, stacking order and nudging. Returns `true` when the key was used.
 */
export function handleShortcut(engine: AnnotatorEngine, e: KeyInput): boolean {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (e.mod) {
    if (key === 'z') {
      void (e.shift ? engine.history.redo() : engine.history.undo());
      return true;
    }
    if (key === 'y') {
      void engine.history.redo();
      return true;
    }
    if (key === 'a') {
      engine.selectAll();
      return true;
    }
    if (key === 'd') {
      engine.duplicateSelection();
      return true;
    }
    return false;
  }

  if (key === 'Escape') {
    engine.tools.cancel();
    if (engine.selection.ids.get().length > 0) engine.selection.clear();
    else if (engine.tools.active.get() !== 'select') engine.tools.setTool('select');
    return true;
  }
  if (key === 'Delete' || key === 'Backspace') {
    engine.deleteSelection();
    return true;
  }
  const arrow = ARROWS[key];
  if (arrow && engine.selection.ids.get().length > 0) {
    const step = e.shift ? 10 : 1;
    engine.nudgeSelection(arrow[0] * step, arrow[1] * step);
    return true;
  }
  if (key === '0') {
    engine.fit();
    return true;
  }
  if (key === '+' || key === '=') {
    engine.viewport.zoomBy(1.25);
    return true;
  }
  if (key === '-' || key === '_') {
    engine.viewport.zoomBy(1 / 1.25);
    return true;
  }
  if ((key === '[' || key === ']') && engine.canEdit) {
    const ids = engine.editableSelection().map((a) => a.id);
    engine.store.reorder(ids, key === ']' ? 'forward' : 'backward');
    return true;
  }
  const tool = TOOL_KEYS[key];
  if (tool && !e.alt) return engine.tools.setTool(tool);
  return false;
}
