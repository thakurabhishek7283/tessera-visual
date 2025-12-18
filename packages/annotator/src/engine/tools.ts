import type { Store } from '@tessera/core';
import { createStore } from '@tessera/core';
import type { ToolId } from '../config.js';
import type { Annotation, Geometry, Point, Style } from '../geometry/model.js';
import type { AnnotatorEngine } from './engine.js';

/** A pointer event with the viewport transform applied, free of any DOM type. */
export interface NormalizedPointer {
  world: Point;
  screen: Point;
  pressure: number;
  shift: boolean;
  alt: boolean;
  /** Ctrl, or ⌘ on macOS. */
  mod: boolean;
  button: number;
  pointerType: 'mouse' | 'pen' | 'touch';
}

/** A key event without the DOM. */
export interface KeyInput {
  key: string;
  shift: boolean;
  alt: boolean;
  mod: boolean;
}

export interface ToolContext {
  engine: AnnotatorEngine;
  /** Pick radius in world units: the configured pixels divided by the zoom. */
  tolerance: number;
  /** Shows a shape that is still being drawn, or hides it with `null`. */
  preview(geometry: Geometry | null, style?: Style): void;
  /** Turns a finished shape into an annotation (label flow and host veto included). */
  commit(geometry: Geometry, style?: Style): Promise<Annotation | null>;
  setCursor(cursor: string): void;
  /** Snaps `p` to nearby shapes when snapping is on, and shows the snap indicator. */
  snap(p: Point, excludeId?: string): Point;
}

export interface Tool {
  id: ToolId;
  cursor: string;
  onPointerDown?(e: NormalizedPointer, ctx: ToolContext): void;
  onPointerMove?(e: NormalizedPointer, ctx: ToolContext): void;
  onPointerUp?(e: NormalizedPointer, ctx: ToolContext): void;
  onDoubleClick?(e: NormalizedPointer, ctx: ToolContext): void;
  /** Return `true` when the key was used, so global shortcuts skip it. */
  onKeyDown?(e: KeyInput, ctx: ToolContext): boolean;
  /** Abandons whatever is in progress (tool switch, second finger, Escape). */
  cancel?(ctx: ToolContext): void;
}

/** Pick radius in screen pixels. */
export const PICK_PX = 6;

/** Routes normalized input to the active tool and tracks which tool that is. */
export class ToolManager {
  readonly active: Store<ToolId>;
  readonly #tools = new Map<ToolId, Tool>();
  readonly #engine: AnnotatorEngine;
  #held: ToolId | undefined;
  #pointerDown = false;

  constructor(engine: AnnotatorEngine, initial: ToolId) {
    this.#engine = engine;
    this.active = createStore<ToolId>(initial);
  }

  register(tool: Tool): void {
    this.#tools.set(tool.id, tool);
  }

  get current(): Tool | undefined {
    return this.#tools.get(this.#held ?? this.active.get());
  }

  /** The tool that handles input: the held override (pan) or the chosen one. */
  get currentId(): ToolId {
    return this.#held ?? this.active.get();
  }

  context(): ToolContext {
    return this.#engine.toolContext();
  }

  /** Switches tool. Unknown or disabled tools are refused; `pan` is always available. */
  setTool(id: ToolId): boolean {
    if (id === this.active.get()) return true;
    if (!this.#tools.has(id)) return false;
    if (id !== 'pan' && !this.#engine.toolEnabled(id)) return false;
    this.cancel();
    this.active.set(id);
    this.#engine.setCursor(this.current?.cursor ?? 'default');
    return true;
  }

  /** Holding space (or the middle button) pans without changing the chosen tool. */
  holdPan(on: boolean): void {
    if (on === (this.#held === 'pan')) return;
    this.cancel();
    this.#held = on ? 'pan' : undefined;
    this.#engine.setCursor(this.current?.cursor ?? 'default');
  }

  cancel(): void {
    this.current?.cancel?.(this.context());
    this.#engine.preview.set(null);
    this.#engine.snapIndicator.set(null);
    this.#engine.marquee.set(null);
    this.#engine.drafts.set(new Map());
    this.#engine.erasing.set([]);
    this.#pointerDown = false;
  }

  pointerDown(e: NormalizedPointer): void {
    this.#pointerDown = true;
    this.current?.onPointerDown?.(e, this.context());
  }

  pointerMove(e: NormalizedPointer): void {
    this.current?.onPointerMove?.(e, this.context());
  }

  pointerUp(e: NormalizedPointer): void {
    if (!this.#pointerDown) return;
    this.#pointerDown = false;
    this.current?.onPointerUp?.(e, this.context());
  }

  doubleClick(e: NormalizedPointer): void {
    this.current?.onDoubleClick?.(e, this.context());
  }

  keyDown(e: KeyInput): boolean {
    return this.current?.onKeyDown?.(e, this.context()) ?? false;
  }
}
