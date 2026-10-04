import type { ReadonlyStore, Store } from '@tessera-kit/core';
import { createStore } from '@tessera-kit/core';

/** The selected annotation ids, in selection order. The last one is the primary selection. */
export class Selection {
  readonly ids: Store<readonly string[]> = createStore<readonly string[]>([]);

  get store(): ReadonlyStore<readonly string[]> {
    return this.ids;
  }

  /** The most recently selected id: the one the side panel shows. */
  primary(): string | undefined {
    return this.ids.get().at(-1);
  }

  has(id: string): boolean {
    return this.ids.get().includes(id);
  }

  set(ids: readonly string[]): void {
    const unique = [...new Set(ids)];
    const current = this.ids.get();
    if (unique.length === current.length && unique.every((id, i) => id === current[i])) return;
    this.ids.set(unique);
  }

  add(id: string): void {
    if (!this.has(id)) this.ids.set([...this.ids.get(), id]);
  }

  toggle(id: string): void {
    this.ids.set(this.has(id) ? this.ids.get().filter((x) => x !== id) : [...this.ids.get(), id]);
  }

  clear(): void {
    if (this.ids.get().length > 0) this.ids.set([]);
  }

  /** Drops ids that no longer exist. */
  prune(exists: (id: string) => boolean): void {
    const current = this.ids.get();
    const kept = current.filter(exists);
    if (kept.length !== current.length) this.ids.set(kept);
  }
}
