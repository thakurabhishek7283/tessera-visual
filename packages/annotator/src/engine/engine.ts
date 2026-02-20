import {
  type Clock,
  createEventBus,
  createHistory,
  createIdGenerator,
  createStore,
  type EventBus,
  type History,
  type IdGenerator,
  type ReadonlyStore,
  type Store,
  systemClock,
} from '@tessera/core';
import type { AnnotatorConfigValue, ToolId } from '../config.js';
import { unionRect } from '../geometry/bbox.js';
import { type HitOptions, hitTest } from '../geometry/hit.js';
import {
  type Annotation,
  type Geometry,
  labelOf,
  type NewAnnotation,
  type Point,
  type Rect,
  type Style,
} from '../geometry/model.js';
import { snapPoint } from '../geometry/snap.js';
import { translate } from '../geometry/transform.js';
import { INK } from './color.js';
import { Selection } from './selection.js';
import { SpatialIndex } from './spatial.js';
import { AnnotationStore, type Patch } from './store.js';
import { PICK_PX, type ToolContext, ToolManager } from './tools.js';
import { Viewport } from './viewport.js';

export type SurfaceMode = 'image' | 'board';

/** Callbacks the UI layer provides for steps that need a person. */
export interface EngineHooks {
  /** Host veto: return `false` to discard a shape the user just drew. */
  beforeCreate?(draft: Annotation): boolean;
  /** Asks for a label. A string accepts, `null` cancels (and discards the shape). */
  pickLabel?(draft: Annotation): Promise<string | null>;
  /** Edits text in place. Resolves with the new text, or `null` when cancelled. */
  editText?(request: {
    x: number;
    y: number;
    fontSize: number;
    text: string;
  }): Promise<string | null>;
}

/** What changed in the list, by id. */
export interface ChangeSet {
  created: Annotation[];
  updated: Array<{ before: Annotation; after: Annotation }>;
  deleted: Annotation[];
}

export interface EngineEvents {
  changed: ChangeSet;
}

export interface EngineOptions {
  mode: SurfaceMode;
  config: AnnotatorConfigValue;
  clock?: Clock;
  ids?: IdGenerator;
  history?: History;
  /** Id of the current user, stamped on new annotations. */
  user?: () => string | undefined;
}

const DEFAULT_BOARD: Rect = { x: -500, y: -350, w: 1000, h: 700 };

/**
 * Everything about one annotated surface except the pixels: shapes, selection, viewport, tools
 * and history. It touches no DOM, so it is driven in unit tests by scripted pointer events.
 */
export class AnnotatorEngine {
  readonly mode: SurfaceMode;
  readonly clock: Clock;
  readonly history: History;
  readonly store: AnnotationStore;
  readonly index = new SpatialIndex();
  readonly viewport: Viewport;
  readonly selection = new Selection();
  readonly tools: ToolManager;
  readonly events: EventBus<EngineEvents> = createEventBus<EngineEvents>();
  /** Natural size of the image, or `null` on a board. */
  readonly surface: Store<{ w: number; h: number } | null> = createStore<{
    w: number;
    h: number;
  } | null>(null);
  /** Style of the next shape. */
  readonly drawStyle: Store<Style>;
  /** The shape being drawn, in world coordinates. */
  readonly preview: Store<{ geometry: Geometry; style?: Style } | null> = createStore<{
    geometry: Geometry;
    style?: Style;
  } | null>(null);
  readonly snapIndicator: Store<Point | null> = createStore<Point | null>(null);
  /** The selection rectangle being dragged, in world coordinates. */
  readonly marquee: Store<Rect | null> = createStore<Rect | null>(null);
  /** Geometry shown instead of the stored one while a drag is in progress (one undo step on drop). */
  readonly drafts: Store<ReadonlyMap<string, Geometry>> = createStore<
    ReadonlyMap<string, Geometry>
  >(new Map());
  /** Ids the eraser has touched; they are dimmed until the pointer is released. */
  readonly erasing: Store<readonly string[]> = createStore<readonly string[]>([]);
  readonly cursor: Store<string> = createStore('default');
  hooks: EngineHooks = {};

  #config: AnnotatorConfigValue;
  #loading = false;
  readonly #pending = new Set<Promise<unknown>>();

  constructor(opts: EngineOptions) {
    this.mode = opts.mode;
    this.#config = opts.config;
    this.clock = opts.clock ?? systemClock;
    this.history = opts.history ?? createHistory({ clock: this.clock });
    this.store = new AnnotationStore({
      clock: this.clock,
      ids: opts.ids ?? createIdGenerator({ clock: this.clock }),
      history: this.history,
      user: opts.user ?? (() => undefined),
    });
    this.viewport = new Viewport(
      this.mode === 'board' ? { minScale: 0.1, maxScale: 8 } : { minScale: 0.05, maxScale: 8 },
    );
    this.drawStyle = createStore<Style>(
      this.mode === 'board'
        ? { stroke: INK, strokeWidth: 3, opacity: 1 }
        : { stroke: this.#config.labels[0]?.color ?? 'blue', strokeWidth: 2, opacity: 1 },
    );
    this.tools = new ToolManager(this, this.#config.defaultTool);

    this.store.list.subscribe((next, prev) => {
      this.index.sync(next);
      this.selection.prune((id) => this.store.has(id));
      if (!this.#loading) this.events.emit('changed', diff(prev, next));
    });
  }

  get config(): AnnotatorConfigValue {
    return this.#config;
  }

  /** Applies new options (read-only mode, tool list…) without rebuilding the engine. */
  setConfig(config: AnnotatorConfigValue): void {
    this.#config = config;
    if (config.readOnly) this.selection.clear();
    if (this.tools.active.get() !== 'pan' && !this.toolEnabled(this.tools.active.get())) {
      this.tools.setTool(config.tools.includes('select') ? 'select' : 'pan');
    }
  }

  get annotations(): ReadonlyStore<readonly Annotation[]> {
    return this.store.list;
  }

  get canEdit(): boolean {
    return !this.#config.readOnly;
  }

  /** Board strokes scale with the world; image strokes keep a constant on-screen width. */
  get strokeScales(): boolean {
    return this.mode === 'board';
  }

  /** Whether `id` is offered: configured and, when read-only, a non-drawing tool. */
  toolEnabled(id: ToolId): boolean {
    if (id === 'pan') return true;
    if (!this.#config.tools.includes(id)) return false;
    return this.canEdit || id === 'select';
  }

  setCursor(cursor: string): void {
    this.cursor.set(cursor);
  }

  /** Pick radius in world units. */
  tolerance(px = PICK_PX): number {
    return px / this.viewport.state.get().scale;
  }

  hitOptions(px = PICK_PX): HitOptions {
    const measure = this.index.measure;
    return {
      tolerance: this.tolerance(px),
      scale: this.viewport.state.get().scale,
      strokeScales: this.strokeScales,
      ...(measure ? { measure } : {}),
    };
  }

  /** The topmost visible annotation at `world`, or `undefined`. */
  hit(world: Point, px = PICK_PX): Annotation | undefined {
    const options = this.hitOptions(px);
    const list = this.store.list.get();
    const order = new Map(list.map((a, i) => [a.id, i]));
    // The broad phase is padded by the stroke so thick lines are found too.
    const candidates = this.index
      .queryPoint(world, options.tolerance + 100 / options.scale)
      .map((id) => ({ id, z: order.get(id) ?? -1 }))
      .sort((a, b) => b.z - a.z);
    for (const { id } of candidates) {
      const a = list[order.get(id) as number];
      if (a && hitTest(a, world, options)) return a;
    }
    return undefined;
  }

  /** Annotations whose box touches `rect` (or lies inside it), topmost last. */
  within(rect: Rect, mode: 'touch' | 'contain'): Annotation[] {
    const list = this.store.list.get();
    const ids = new Set(this.index.search(rect));
    return list.filter((a) => {
      if (!ids.has(a.id) || a.hidden) return false;
      if (mode === 'touch') return true;
      const b = this.index.bbox(a);
      return (
        b.x >= rect.x &&
        b.y >= rect.y &&
        b.x + b.w <= rect.x + rect.w &&
        b.y + b.h <= rect.y + rect.h
      );
    });
  }

  toolContext(): ToolContext {
    return {
      engine: this,
      tolerance: this.tolerance(),
      preview: (geometry, style) =>
        this.preview.set(geometry ? { geometry, ...(style ? { style } : {}) } : null),
      commit: (geometry, style) => this.create(geometry, style),
      setCursor: (c) => this.setCursor(c),
      snap: (p, excludeId) => this.snap(p, excludeId),
    };
  }

  /** Snaps to other shapes when enabled; always updates the indicator. */
  snap(p: Point, excludeId?: string): Point {
    const { enabled, tolerancePx } = this.#config.snapping;
    if (!enabled) {
      this.snapIndicator.set(null);
      return p;
    }
    const tol = this.tolerance(tolerancePx);
    const near = this.index.queryPoint(p, tol).flatMap((id) => this.store.get(id) ?? []);
    const hit = snapPoint(p, near, tol, excludeId);
    this.snapIndicator.set(hit ? hit.point : null);
    return hit ? hit.point : p;
  }

  /** Style for a new shape, with the colour of the default label when one is set. */
  styleForNew(label?: string): Style {
    const base = this.drawStyle.get();
    const color = label ? this.#config.labels.find((l) => l.value === label)?.color : undefined;
    return color && this.mode === 'image' ? { ...base, stroke: color } : { ...base };
  }

  /**
   * Turns a drawn shape into an annotation: host veto, label flow, history, selection.
   * Resolves with `null` when the shape was discarded.
   */
  create(geometry: Geometry, style?: Style): Promise<Annotation | null> {
    const job = this.#create(geometry, style);
    this.#pending.add(job);
    void job.finally(() => this.#pending.delete(job));
    return job;
  }

  async #create(geometry: Geometry, override?: Style): Promise<Annotation | null> {
    if (!this.canEdit) return null;
    const draft: Annotation = {
      id: '',
      geometry,
      bodies: [],
      style: { ...this.styleForNew(), ...override },
      createdAt: '',
      updatedAt: '',
    };
    if (this.hooks.beforeCreate?.(draft) === false) return null;
    let label: string | undefined;
    if (this.#config.requireLabel && this.hooks.pickLabel) {
      const picked = await this.hooks.pickLabel(draft);
      if (picked === null) return null;
      label = picked;
    }
    const [created] = this.store.add([
      {
        geometry,
        bodies: label ? [{ purpose: 'tagging', value: label }] : [],
        style: { ...this.styleForNew(label), ...override },
      },
    ]);
    if (!created) return null;
    this.selection.set([created.id]);
    return created;
  }

  /** Resolves once every shape that is waiting on a label or text prompt has settled. */
  async settled(): Promise<void> {
    while (this.#pending.size > 0) await Promise.allSettled([...this.#pending]);
  }

  // ---- editing actions shared by the UI, shortcuts and the public handle ----

  /** Selected annotations that can be changed. */
  editableSelection(): Annotation[] {
    if (!this.canEdit) return [];
    return this.selection.ids
      .get()
      .flatMap((id) => this.store.get(id) ?? [])
      .filter((a) => !a.locked);
  }

  deleteSelection(): void {
    const ids = this.editableSelection().map((a) => a.id);
    if (ids.length > 0)
      this.store.remove(ids, ids.length > 1 ? 'Delete annotations' : 'Delete annotation');
  }

  duplicateSelection(offset = 12): void {
    const items = this.editableSelection();
    if (items.length === 0) return;
    const shift = this.tolerance(offset);
    const copies: NewAnnotation[] = items.map((a) => {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = a;
      return { ...rest, geometry: translate(a.geometry, shift, shift) };
    });
    const created = this.store.add(copies, 'Duplicate');
    this.selection.set(created.map((a) => a.id));
  }

  nudgeSelection(dx: number, dy: number): void {
    const items = this.editableSelection();
    if (items.length === 0) return;
    this.store.update(
      items.map((a) => ({ id: a.id, patch: { geometry: translate(a.geometry, dx, dy) } })),
      'Move',
      { mergeKey: `nudge:${items.map((a) => a.id).join(',')}` },
    );
  }

  selectAll(): void {
    this.selection.set(
      this.store.list
        .get()
        .filter((a) => !a.hidden)
        .map((a) => a.id),
    );
  }

  /** Applies a patch to annotations, as one undo step. */
  update(id: string, patch: Patch): void {
    this.store.update([{ id, patch }]);
  }

  /** The annotation as it should look now: with the geometry of a drag in progress, if any. */
  effective(a: Annotation): Annotation {
    const draft = this.drafts.get().get(a.id);
    return draft ? { ...a, geometry: draft } : a;
  }

  /** Asks the UI to edit a text annotation in place; an empty result deletes it. */
  async editText(id: string): Promise<void> {
    const a = this.store.get(id);
    if (!a || a.geometry.type !== 'text' || !this.canEdit || a.locked || !this.hooks.editText)
      return;
    const g = a.geometry;
    const next = await this.hooks.editText({ x: g.x, y: g.y, fontSize: g.fontSize, text: g.text });
    if (next === null || next === g.text) return;
    if (next.trim() === '') this.store.remove([id]);
    else this.store.update([{ id, patch: { geometry: { ...g, text: next } } }], 'Edit text');
  }

  // ---- view ----

  /** The area the user can look at: the image, or the drawn content of a board. */
  contentRect(): Rect {
    const surface = this.surface.get();
    if (this.mode === 'image' && surface) return { x: 0, y: 0, w: surface.w, h: surface.h };
    const boxes = this.store.list
      .get()
      .filter((a) => !a.hidden)
      .map((a) => this.index.bbox(a));
    if (boxes.length === 0) return DEFAULT_BOARD;
    return boxes.reduce(unionRect);
  }

  setSurface(size: { w: number; h: number } | null): void {
    this.surface.set(size);
    // Without a measured view there is nothing to fit to yet; the surface fits on its first size.
    if (this.viewport.size.get().w > 0) this.fit();
  }

  /** Shows the whole surface. For an image this also sets how far the user can zoom out. */
  fit(): void {
    const rect = this.contentRect();
    if (this.mode === 'image') {
      const fitted = this.viewport.fitScale(rect);
      this.viewport.setLimits({ minScale: Math.min(fitted / 2, 1), maxScale: Math.max(8, fitted) });
    }
    this.viewport.fit(rect, this.mode === 'image' ? 16 : 48);
  }

  /** Brings an annotation into view and keeps the current zoom when it has no size. */
  zoomTo(id: string): void {
    const a = this.store.get(id);
    if (!a) return;
    const box = this.index.bbox(a);
    if (box.w < 1 && box.h < 1) {
      const { w, h } = this.viewport.size.get();
      const { scale } = this.viewport.state.get();
      this.viewport.set({
        scale,
        tx: w / 2 - (box.x + box.w / 2) * scale,
        ty: h / 2 - (box.y + box.h / 2) * scale,
      });
      return;
    }
    this.viewport.fit(box, 64);
  }

  /** Replaces the annotations without recording history or raising change events. */
  load(list: readonly Annotation[]): void {
    this.#loading = true;
    try {
      this.store.load(list);
    } finally {
      this.#loading = false;
    }
  }

  destroy(): void {
    this.tools.cancel();
    this.drafts.set(new Map());
    this.index.clear();
  }

  /** Label of the annotation, for the list and announcements. */
  labelOf(a: Annotation): string | undefined {
    return labelOf(a);
  }
}

function diff(prev: readonly Annotation[], next: readonly Annotation[]): ChangeSet {
  const before = new Map(prev.map((a) => [a.id, a]));
  const after = new Map(next.map((a) => [a.id, a]));
  const changes: ChangeSet = { created: [], updated: [], deleted: [] };
  for (const a of next) {
    const was = before.get(a.id);
    if (!was) changes.created.push(a);
    else if (was !== a) changes.updated.push({ before: was, after: a });
  }
  for (const a of prev) if (!after.has(a.id)) changes.deleted.push(a);
  return changes;
}

export function createEngine(opts: EngineOptions): AnnotatorEngine {
  return new AnnotatorEngine(opts);
}
