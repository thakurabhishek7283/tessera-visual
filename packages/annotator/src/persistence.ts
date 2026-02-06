import { type Doc, type TesseraContext, TesseraError, type Unsubscribe } from '@tessera/core';
import { type Collection, createCollection } from '@tessera/storage';
import { z } from 'zod';
import type { AnnotatorEngine, ChangeSet } from './engine/engine.js';
import { type Annotation, AnnotationSchema } from './geometry/model.js';

/** How long a deletion is remembered so that other copies of the set do not bring the shape back. */
export const TOMBSTONE_DAYS = 30;
const MAX_ATTEMPTS = 5;

export const SetDoc = z.object({
  /** What is annotated: the image URL, or the board id. */
  source: z.string().max(2000),
  annotations: z.array(AnnotationSchema).max(5000),
  deletedIds: z.array(z.object({ id: z.string(), at: z.string() })).max(5000),
});
export type SetDocValue = z.infer<typeof SetDoc>;

const time = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Merges two copies of a set, one annotation at a time: the newer `updatedAt` wins (ties keep
 * `local`), a deletion wins over an older edit and loses against a newer one, and deletions older
 * than {@link TOMBSTONE_DAYS} are forgotten. The stacking order of `remote` is kept, so a reorder
 * reaches everyone; shapes only `local` has go on top.
 */
export function mergeSets(local: SetDocValue, remote: SetDocValue, nowMs: number): SetDocValue {
  const tombstones = new Map<string, string>();
  for (const t of [...local.deletedIds, ...remote.deletedIds]) {
    const known = tombstones.get(t.id);
    if (known === undefined || time(t.at) > time(known)) tombstones.set(t.id, t.at);
  }

  const chosen = new Map<string, Annotation>();
  for (const a of local.annotations) chosen.set(a.id, a);
  for (const b of remote.annotations) {
    const a = chosen.get(b.id);
    if (!a || time(b.updatedAt) > time(a.updatedAt)) chosen.set(b.id, b);
  }

  for (const [id, at] of tombstones) {
    const a = chosen.get(id);
    if (!a) continue;
    // Edited after it was deleted: the edit stands, so the deletion is void.
    if (time(a.updatedAt) > time(at)) tombstones.delete(id);
    else chosen.delete(id);
  }

  const horizon = nowMs - TOMBSTONE_DAYS * 86_400_000;
  const order = [...remote.annotations, ...local.annotations].map((a) => a.id);
  const seen = new Set<string>();
  const annotations: Annotation[] = [];
  for (const id of order) {
    const a = chosen.get(id);
    if (a && !seen.has(id)) {
      seen.add(id);
      annotations.push(a);
    }
  }
  const deletedIds = [...tombstones]
    .filter(([, at]) => time(at) >= horizon)
    .map(([id, at]) => ({ id, at }));
  return { source: local.source, annotations, deletedIds };
}

/** Same shapes at the same revisions and the same deletions, whatever the order. */
function sameSet(a: SetDocValue, b: SetDocValue): boolean {
  const revisions = (s: SetDocValue): string =>
    s.annotations
      .map((x) => `${x.id}@${x.updatedAt}`)
      .sort()
      .join('|');
  return (
    revisions(a) === revisions(b) &&
    a.deletedIds
      .map((d) => d.id)
      .sort()
      .join('|') ===
      b.deletedIds
        .map((d) => d.id)
        .sort()
        .join('|')
  );
}

/** FNV-1a, 32 bits, as hex: a short stable id for a source URL. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The document id of a set: the explicit `set-id` when it is a safe id, else a hash of the source. */
export function setDocId(source: string, setId?: string): string {
  if (setId && /^[A-Za-z0-9_.:-]{1,120}$/.test(setId)) return setId;
  return `src-${hash(setId ?? source)}${hash(`${source.length}:${setId ?? source}`)}`;
}

export interface PersistenceOptions {
  ctx: Pick<TesseraContext, 'storage' | 'logger' | 'clock'>;
  engine: AnnotatorEngine;
  source: string;
  setId?: string | undefined;
  /** Wait after the last change before saving. */
  debounceMs?: number;
}

/**
 * Keeps one set in the `annotator.sets` collection: loads it, saves local changes after a short
 * pause, merges when someone else saved first, and follows live changes where storage reports them.
 */
export class SetPersistence {
  readonly docId: string;
  readonly #opts: PersistenceOptions;
  readonly #coll: Collection<SetDocValue>;
  readonly #deleted = new Map<string, string>();
  readonly #offs: Unsubscribe[] = [];
  #version: number | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #dirty = false;
  #saving: Promise<void> = Promise.resolve();
  #destroyed = false;

  constructor(opts: PersistenceOptions) {
    this.#opts = opts;
    this.docId = setDocId(opts.source, opts.setId);
    this.#coll = createCollection(opts.ctx, 'annotator.sets', SetDoc);
  }

  #local(): SetDocValue {
    return {
      source: this.#opts.source,
      annotations: [...this.#opts.engine.annotations.get()],
      deletedIds: [...this.#deleted].map(([id, at]) => ({ id, at })),
    };
  }

  /** Applies a merged set to the engine and remembers its tombstones. */
  #adopt(merged: SetDocValue): void {
    this.#deleted.clear();
    for (const t of merged.deletedIds) this.#deleted.set(t.id, t.at);
    this.#opts.engine.load(merged.annotations);
  }

  /** Loads the stored set (if any) and starts following changes. */
  async start(): Promise<void> {
    const { engine, ctx } = this.#opts;
    const doc = await this.#coll.get(this.docId);
    if (this.#destroyed) return;
    if (doc) this.#merge(doc);
    this.#offs.push(
      engine.events.on('changed', (changes) => this.#onLocal(changes)),
      this.#coll.watch((change) => {
        if (change.id !== this.docId || change.deleted) return;
        if (this.#version !== undefined && change.version <= this.#version) return;
        void this.#coll.get(this.docId).then(
          (remote) => {
            if (remote && !this.#destroyed) this.#merge(remote);
          },
          (error: unknown) => ctx.logger.warn('could not read a changed annotation set', error),
        );
      }),
    );
  }

  /** Merges a stored copy into the engine; saves when the result differs from what is stored. */
  #merge(remote: Doc<SetDocValue>): void {
    const now = this.#opts.ctx.clock.now();
    const merged = mergeSets(this.#local(), remote.data, now);
    this.#adopt(merged);
    this.#version = remote.version;
    if (!sameSet(merged, remote.data)) this.#schedule();
  }

  #onLocal(changes: ChangeSet): void {
    const at = new Date(this.#opts.ctx.clock.now()).toISOString();
    for (const a of changes.deleted) this.#deleted.set(a.id, at);
    // Bringing a shape back (undo) cancels its tombstone.
    for (const a of changes.created) this.#deleted.delete(a.id);
    this.#schedule();
  }

  #schedule(): void {
    this.#dirty = true;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.flush();
    }, this.#opts.debounceMs ?? 500);
  }

  /** Saves now if there is anything unsaved. Resolves when the write (and any merge) is done. */
  flush(): Promise<void> {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    this.#saving = this.#saving.then(() => this.#save());
    return this.#saving;
  }

  async #save(): Promise<void> {
    if (!this.#dirty) return;
    const { ctx } = this.#opts;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      this.#dirty = false;
      try {
        const stored = await this.#coll.put({
          id: this.docId,
          data: this.#local(),
          // Version 0 means "must not exist yet", so two first saves cannot overwrite each other.
          version: this.#version ?? 0,
        });
        this.#version = stored.version;
        return;
      } catch (error) {
        if (!TesseraError.is(error, 'CONFLICT')) {
          this.#dirty = true;
          ctx.logger.warn('could not save annotations', error);
          return;
        }
        const current = (error.details as { current?: Doc<unknown> } | undefined)?.current;
        const parsed = SetDoc.safeParse(current?.data);
        if (!current || !parsed.success) {
          // Someone stored something this kit cannot read: replace it rather than lose local work.
          this.#version = current?.version;
          this.#dirty = true;
          continue;
        }
        this.#adopt(mergeSets(this.#local(), parsed.data, ctx.clock.now()));
        this.#version = current.version;
        this.#dirty = true;
      }
    }
    ctx.logger.warn('gave up saving annotations after repeated conflicts');
  }

  /** Writes what is pending and stops following changes. */
  async destroy(): Promise<void> {
    this.#destroyed = true;
    for (const off of this.#offs.splice(0)) off();
    if (this.#dirty || this.#timer !== undefined) await this.flush();
  }
}
