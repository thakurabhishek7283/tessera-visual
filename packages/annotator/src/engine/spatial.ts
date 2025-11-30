import RBush from 'rbush';
import { bboxOf, type TextMeasure } from '../geometry/bbox.js';
import type { Annotation, Point, Rect } from '../geometry/model.js';

interface Entry {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

const entryOf = (id: string, r: Rect): Entry => ({
  minX: r.x,
  minY: r.y,
  maxX: r.x + r.w,
  maxY: r.y + r.h,
  id,
});

/** R-tree over annotation bounding boxes: the broad phase of hit testing and marquee selection. */
export class SpatialIndex {
  readonly #tree = new RBush<Entry>();
  readonly #entries = new Map<string, Entry>();
  readonly #known = new Map<string, Annotation>();
  #boxes = new WeakMap<Annotation, Rect>();
  #measure: TextMeasure | undefined;

  /** Bounding box of an annotation, cached per immutable annotation object. */
  bbox(a: Annotation): Rect {
    let box = this.#boxes.get(a);
    if (!box) {
      box = bboxOf(a.geometry, this.#measure);
      this.#boxes.set(a, box);
    }
    return box;
  }

  /** Swaps the text measurer (the renderer provides real measurements) and rebuilds the boxes. */
  setMeasure(measure: TextMeasure | undefined): void {
    this.#measure = measure;
    this.#boxes = new WeakMap();
    const all = [...this.#known.values()];
    this.clear();
    this.#bulk(all);
  }

  get measure(): TextMeasure | undefined {
    return this.#measure;
  }

  clear(): void {
    this.#tree.clear();
    this.#entries.clear();
    this.#known.clear();
  }

  #bulk(list: readonly Annotation[]): void {
    const entries = list.map((a) => entryOf(a.id, this.bbox(a)));
    this.#tree.load(entries);
    for (const [i, a] of list.entries()) {
      this.#entries.set(a.id, entries[i] as Entry);
      this.#known.set(a.id, a);
    }
  }

  /** Brings the index in line with `next`, touching only the shapes that changed. */
  sync(next: readonly Annotation[]): void {
    if (this.#known.size === 0 || next.length > 200 + this.#known.size * 2) {
      this.clear();
      this.#bulk(next);
      return;
    }
    const seen = new Set<string>();
    for (const a of next) {
      seen.add(a.id);
      const had = this.#known.get(a.id);
      if (had === a) continue;
      const old = this.#entries.get(a.id);
      if (old) this.#tree.remove(old);
      const entry = entryOf(a.id, this.bbox(a));
      this.#tree.insert(entry);
      this.#entries.set(a.id, entry);
      this.#known.set(a.id, a);
    }
    for (const [id, entry] of this.#entries) {
      if (seen.has(id)) continue;
      this.#tree.remove(entry);
      this.#entries.delete(id);
      this.#known.delete(id);
    }
  }

  /** Ids whose bounding box touches `rect`. */
  search(rect: Rect): string[] {
    return this.#tree
      .search({ minX: rect.x, minY: rect.y, maxX: rect.x + rect.w, maxY: rect.y + rect.h })
      .map((e) => e.id);
  }

  /** Ids whose bounding box lies within `tolerance` of `p`. */
  queryPoint(p: Point, tolerance: number): string[] {
    return this.search({
      x: p[0] - tolerance,
      y: p[1] - tolerance,
      w: tolerance * 2,
      h: tolerance * 2,
    });
  }

  get size(): number {
    return this.#entries.size;
  }
}
