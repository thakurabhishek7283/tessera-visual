import type { TesseraContext } from '@tessera-kit/core';
import type { MapsConfigValue } from '../config.js';
import type { MapHandle, MapsApi } from '../types.js';

type Overrides = Partial<Omit<MapsConfigValue, 'enabled'>>;

/**
 * Keeps one map open inside a container for an element: opens it when the feature is available,
 * reopens when `key` changes, and closes it when the feature goes away or the element is removed.
 * A failure is remembered, so a map that cannot load is not retried in a render loop.
 */
export class MapSession {
  handle: MapHandle | undefined;
  failure: string | undefined;
  loading = false;
  #key: string | undefined;
  #opening: string | undefined;
  #failed: string | undefined;
  #generation = 0;

  constructor(
    private readonly onChange: () => void,
    private readonly onOpen: (handle: MapHandle) => void,
    private readonly onClose: () => void = () => {},
  ) {}

  sync(
    ctx: TesseraContext | undefined,
    enabled: boolean,
    container: HTMLElement | null,
    key: string,
    options: Overrides,
  ): void {
    const api = enabled ? (ctx?.services.get('maps') as MapsApi | undefined) : undefined;
    if (!api || !container) {
      this.close();
      return;
    }
    if (key === this.#key || key === this.#opening || key === this.#failed) return;
    this.close();
    void this.#open(api, container, key, options);
  }

  async #open(
    api: MapsApi,
    container: HTMLElement,
    key: string,
    options: Overrides,
  ): Promise<void> {
    const generation = ++this.#generation;
    this.#opening = key;
    this.failure = undefined;
    this.loading = true;
    this.onChange();
    try {
      const handle = await api.create(container, options);
      if (generation !== this.#generation) {
        handle.destroy();
        return;
      }
      this.handle = handle;
      this.#key = key;
      this.loading = false;
      this.onOpen(handle);
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#failed = key;
      this.failure = error instanceof Error ? error.message : String(error);
      this.loading = false;
    } finally {
      if (generation === this.#generation) this.#opening = undefined;
    }
    this.onChange();
  }

  close(): void {
    this.#generation++;
    this.#key = undefined;
    this.#opening = undefined;
    this.#failed = undefined;
    const handle = this.handle;
    this.handle = undefined;
    this.loading = false;
    if (handle) {
      handle.destroy();
      this.onClose();
      this.onChange();
    }
  }
}
