import { definePlugin } from '@tessera/core';
import { createAnnotatorApi } from './api.js';
import { AnnotatorConfig } from './config.js';
import { de } from './i18n/de.js';
import { en } from './i18n/en.js';
import type { AnnotatorApi } from './types.js';

const disposers = new WeakMap<AnnotatorApi, () => Promise<void>>();

/**
 * The `annotator` feature: draw, label and comment on shapes over an image or an endless board.
 * Sets are stored through the instance's storage adapter.
 *
 * @example
 * createTessera(cfg, { plugins: { annotator: () => import('@tessera/annotator') } });
 */
export const annotatorPlugin = definePlugin({
  id: 'annotator',
  version: '0.1.0',
  configSchema: AnnotatorConfig,
  requires: ['storage'],
  messages: { en, de },
  setup(ctx, config): AnnotatorApi {
    const api = createAnnotatorApi(ctx, config);
    disposers.set(api, api.dispose);
    return api;
  },
  async teardown(api) {
    await disposers.get(api)?.();
  },
});

export default annotatorPlugin;
