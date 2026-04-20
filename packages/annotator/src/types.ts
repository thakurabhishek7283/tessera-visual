import type { History, ReadonlyStore, Store, Unsubscribe } from '@tessera/core';
import type { AnnotatorConfigValue, ToolId } from './config.js';
import type { ChangeSet } from './engine/engine.js';
import type { ViewState } from './engine/viewport.js';
import type { Annotation, NewAnnotation, Style } from './geometry/model.js';
import type { W3CAnnotation } from './interop/w3c.js';

export type { ChangeSet, ViewState };

/** Steps that need a person. All are optional; the elements provide them. */
export interface AnnotatorHooks {
  /** Veto a shape the user just drew: return `false` to discard it. */
  beforeCreate?(draft: Annotation): boolean;
  /** Ask for a label after drawing (see `requireLabel`). Resolve `null` to discard the shape. */
  pickLabel?(draft: Annotation): Promise<string | null>;
  /** Edit text in place. Resolve the new text, or `null` when cancelled. */
  editText?(request: {
    x: number;
    y: number;
    fontSize: number;
    text: string;
  }): Promise<string | null>;
}

export interface AnnotatorOptions {
  /** `image` annotates a picture in its own pixels; `board` is an endless whiteboard. */
  mode: 'image' | 'board';
  /** The image URL (`image` mode). */
  src?: string;
  /** Id of the stored set. Defaults to a hash of `src`; boards without one share a default board. */
  setId?: string;
  /** Text alternative of the canvas. */
  alt?: string;
  /** Options for this surface, on top of the feature's configuration. */
  config?: Partial<Omit<AnnotatorConfigValue, 'enabled'>>;
  hooks?: AnnotatorHooks;
}

export interface AnnotatorHandle {
  readonly mode: 'image' | 'board';
  /** The options in effect for this surface. */
  readonly config: AnnotatorConfigValue;
  /** What is annotated: the image URL, or `board:<id>`. */
  readonly source: string;
  /** Key of the stored set, also used to address the discussion of each shape. */
  readonly setId: string;
  readonly annotations: ReadonlyStore<readonly Annotation[]>;
  /** Ids of the selected annotations; the last one is the primary selection. */
  readonly selection: ReadonlyStore<readonly string[]>;
  readonly tool: ReadonlyStore<ToolId>;
  readonly history: History;
  /** Zoom and pan. */
  readonly view: ReadonlyStore<ViewState>;
  /** Size of the visible area in pixels. */
  readonly viewSize: ReadonlyStore<{ w: number; h: number }>;
  /** Style of the next shape. Changing it does not touch existing shapes. */
  readonly drawStyle: Store<Style>;
  setTool(id: ToolId): void;
  add(a: NewAnnotation): Annotation;
  update(id: string, patch: Partial<Omit<Annotation, 'id' | 'createdAt'>>): void;
  remove(ids: readonly string[]): void;
  select(ids: readonly string[]): void;
  /** Shows the whole image, or the whole content of the board. */
  fit(): void;
  zoomBy(factor: number): void;
  zoomTo(id: string): void;
  /** Moves the view so that this world point is in the middle. */
  panTo(x: number, y: number): void;
  /** The area the user can look at: the image, or the drawn content of a board. */
  contentRect(): { x: number; y: number; w: number; h: number };
  setVisible(id: string, visible: boolean): void;
  /** Annotations as W3C Web Annotations targeting `source`. */
  exportW3C(): W3CAnnotation[];
  /** Imports W3C Web Annotations as one undo step. Returns a warning per annotation it had to skip. */
  importW3C(list: unknown, mode: 'replace' | 'merge'): string[];
  /** The image with the shapes on top (a board: its content on the theme background). */
  exportPNG(): Promise<Blob>;
  /** Local changes only: drawing, editing, deleting, undo and redo. */
  on(event: 'change', fn: (changes: ChangeSet) => void): Unsubscribe;
  /** Resolves when pending changes have been written. */
  destroy(): Promise<void>;
}

export interface AnnotatorApi {
  readonly config: AnnotatorConfigValue;
  /**
   * Mounts an annotator into `el`: an SVG surface that fills it, the keyboard and pointer
   * handling, and the stored set. `el` should have a size.
   *
   * @example
   * const handle = await api.create(el, { mode: 'image', src: '/camp.jpg', setId: 'camp-map' });
   * handle.setTool('rect');
   */
  create(el: HTMLElement, opts: AnnotatorOptions): Promise<AnnotatorHandle>;
}

declare module '@tessera/core' {
  interface FeatureApiMap {
    annotator: AnnotatorApi;
  }
  interface ServiceMap {
    annotator: AnnotatorApi;
  }
}
