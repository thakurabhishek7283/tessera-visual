import type { Clock, Command, History, IdGenerator, Store } from '@tessera/core';
import { createStore } from '@tessera/core';
import type { Annotation, NewAnnotation } from '../geometry/model.js';

/** One annotation going from `from` to `to`; `undefined` means "does not exist". */
interface Change {
  id: string;
  from: Annotation | undefined;
  to: Annotation | undefined;
  /** Position in the list when the change was applied, so undo puts a shape back where it was. */
  index: number;
}

export type Patch = Partial<Omit<Annotation, 'id' | 'createdAt'>>;

export interface AnnotationStoreOptions {
  clock: Clock;
  ids: IdGenerator;
  history: History;
  /** Who creates annotations (`createdBy`). */
  user: () => string | undefined;
}

export type ReorderHow = 'forward' | 'backward' | 'front' | 'back';

/** Applies `changes` to a copy of `list`, or undoes them (in reverse order). */
function applyChanges(
  list: readonly Annotation[],
  changes: readonly Change[],
  undo: boolean,
): Annotation[] {
  const out = [...list];
  const ordered = undo ? [...changes].reverse() : changes;
  for (const c of ordered) {
    const to = undo ? c.from : c.to;
    const at = out.findIndex((a) => a.id === c.id);
    if (to === undefined) {
      if (at !== -1) out.splice(at, 1);
    } else if (at === -1) {
      // Creating, or restoring a shape that was deleted. A shape another user removed in the
      // meantime stays removed when an update is undone: only creations and deletions insert.
      if ((undo ? c.to : c.from) === undefined) out.splice(Math.min(c.index, out.length), 0, to);
    } else {
      out[at] = to;
    }
  }
  return out;
}

/**
 * The annotations of one surface, bottom to top. Every mutation goes through the history as a
 * command that only touches the shapes it changed, so undoing never discards what someone else
 * changed in between.
 */
export class AnnotationStore {
  /** Immutable list in z-order (index 0 is painted first). */
  readonly list: Store<readonly Annotation[]> = createStore<readonly Annotation[]>([]);
  readonly #opts: AnnotationStoreOptions;

  constructor(opts: AnnotationStoreOptions) {
    this.#opts = opts;
  }

  get(id: string): Annotation | undefined {
    return this.list.get().find((a) => a.id === id);
  }

  has(id: string): boolean {
    return this.get(id) !== undefined;
  }

  #now(): string {
    return new Date(this.#opts.clock.now()).toISOString();
  }

  #command(label: string, changes: Change[], mergeKey?: string): Command {
    const command: Command = {
      label,
      do: () => this.list.set((l) => applyChanges(l, changes, false)),
      undo: () => this.list.set((l) => applyChanges(l, changes, true)),
    };
    if (mergeKey === undefined) return command;
    return {
      ...command,
      mergeKey,
      merge: (next) => {
        // Only consecutive updates of the same shapes merge, so each id keeps its first `from`.
        const later = (next as Command & { changes?: Change[] }).changes ?? [];
        const merged = changes.map((c) => ({
          ...c,
          to: later.find((n) => n.id === c.id)?.to ?? c.to,
        }));
        return { ...this.#command(label, merged, mergeKey), changes: merged } as Command;
      },
    };
  }

  #push(label: string, changes: Change[], mergeKey?: string): void {
    if (changes.length === 0) return;
    const command = { ...this.#command(label, changes, mergeKey), changes } as Command;
    void this.#opts.history.push(command, { alreadyDone: true });
  }

  /** Adds annotations on top. Returns them with their ids and timestamps filled in. */
  add(items: readonly NewAnnotation[], label = 'Add annotation'): Annotation[] {
    const now = this.#now();
    const user = this.#opts.user();
    const created = items.map(
      (item): Annotation => ({
        ...item,
        id: item.id ?? this.#opts.ids.next(),
        bodies: item.bodies ?? [],
        ...(item.createdBy === undefined && user !== undefined ? { createdBy: user } : {}),
        createdAt: now,
        updatedAt: now,
      }),
    );
    const base = this.list.get().length;
    const changes = created.map(
      (to, i): Change => ({ id: to.id, from: undefined, to, index: base + i }),
    );
    this.list.set((l) => [...l, ...created]);
    this.#push(label, changes);
    return created;
  }

  /** Applies patches (by id) as one undo step. Unknown ids are ignored. */
  update(
    patches: ReadonlyArray<{ id: string; patch: Patch }>,
    label = 'Edit annotation',
    opts: { mergeKey?: string } = {},
  ): Annotation[] {
    const now = this.#now();
    const current = this.list.get();
    const changes: Change[] = [];
    for (const { id, patch } of patches) {
      const index = current.findIndex((a) => a.id === id);
      const from = current[index];
      if (!from) continue;
      changes.push({ id, from, to: { ...from, ...patch, id, updatedAt: now }, index });
    }
    if (changes.length === 0) return [];
    this.list.set((l) => applyChanges(l, changes, false));
    this.#push(label, changes, opts.mergeKey);
    return changes.map((c) => c.to as Annotation);
  }

  remove(ids: readonly string[], label = 'Delete annotation'): Annotation[] {
    const doomed = new Set(ids);
    const changes: Change[] = [];
    const working = [...this.list.get()];
    for (const id of doomed) {
      const index = working.findIndex((a) => a.id === id);
      const from = working[index];
      if (!from) continue;
      changes.push({ id, from, to: undefined, index });
      working.splice(index, 1);
    }
    if (changes.length === 0) return [];
    this.list.set(working);
    this.#push(label, changes);
    return changes.map((c) => c.from as Annotation);
  }

  /** Moves shapes in the z-order. One step moves each selected shape past one unselected neighbour. */
  reorder(ids: readonly string[], how: ReorderHow): boolean {
    const chosen = new Set(ids);
    const before = this.list.get();
    const order = before.filter((a) => chosen.has(a.id));
    if (order.length === 0) return false;
    const rest = before.filter((a) => !chosen.has(a.id));
    let next: Annotation[];
    if (how === 'front') next = [...rest, ...order];
    else if (how === 'back') next = [...order, ...rest];
    else {
      next = [...before];
      const step = how === 'forward' ? 1 : -1;
      const walk = how === 'forward' ? [...next.keys()].reverse() : [...next.keys()];
      for (const i of walk) {
        const a = next[i] as Annotation;
        const j = i + step;
        const other = next[j];
        if (chosen.has(a.id) && other && !chosen.has(other.id)) {
          next[i] = other;
          next[j] = a;
        }
      }
    }
    if (next.every((a, i) => a === before[i])) return false;
    const beforeOrder = before.map((a) => a.id);
    const afterOrder = next.map((a) => a.id);
    const sortBy = (list: readonly Annotation[], order: readonly string[]): Annotation[] => {
      // Shapes added by someone else since stay on top, in their current relative order.
      const rank = new Map(order.map((id, i) => [id, i]));
      return [...list].sort(
        (a, b) =>
          (rank.get(a.id) ?? Number.POSITIVE_INFINITY) -
          (rank.get(b.id) ?? Number.POSITIVE_INFINITY),
      );
    };
    this.list.set(next);
    void this.#opts.history.push(
      {
        label: 'Change order',
        do: () => this.list.set((l) => sortBy(l, afterOrder)),
        undo: () => this.list.set((l) => sortBy(l, beforeOrder)),
      },
      { alreadyDone: true },
    );
    return true;
  }

  /** Replaces everything without touching the history (loading, remote merges). */
  load(list: readonly Annotation[]): void {
    this.list.set(list);
  }
}
