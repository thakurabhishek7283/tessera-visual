import type { TesseraContext } from '@tessera-kit/core';
import type { AnnotatorConfigValue } from './config.js';
import { createSurface } from './surface.js';
import type { AnnotatorApi, AnnotatorHandle } from './types.js';

/** The `annotator` feature API. */
export function createAnnotatorApi(
  ctx: TesseraContext,
  config: AnnotatorConfigValue,
): AnnotatorApi & { dispose(): Promise<void> } {
  const open = new Set<AnnotatorHandle>();
  return {
    config,
    async create(el, opts) {
      const { handle } = await createSurface(ctx, config, el, opts);
      open.add(handle);
      const destroy = handle.destroy.bind(handle);
      handle.destroy = async () => {
        open.delete(handle);
        await destroy();
      };
      return handle;
    },
    async dispose() {
      await Promise.all([...open].map((h) => h.destroy()));
    },
  };
}
