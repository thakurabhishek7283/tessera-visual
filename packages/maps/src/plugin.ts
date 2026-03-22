import { definePlugin } from '@tessera/core';
import { createMapsApi } from './api.js';
import { MapsConfig } from './config.js';
import { de } from './i18n/de.js';
import { en } from './i18n/en.js';
import type { MapsApi } from './types.js';

const disposers = new WeakMap<MapsApi, () => void>();

/**
 * The `maps` feature: MapLibre maps with clustered markers and popups, address search and a
 * location picker. MapLibre loads when the first map opens.
 *
 * @example
 * createTessera(cfg, { plugins: { maps: () => import('@tessera/maps') } });
 */
export const mapsPlugin = definePlugin({
  id: 'maps',
  version: '0.1.0',
  configSchema: MapsConfig,
  messages: { en, de },
  setup(ctx, config): MapsApi {
    const api = createMapsApi(ctx, config);
    disposers.set(api, api.dispose);
    return api;
  },
  teardown(api) {
    disposers.get(api)?.();
  },
});

export default mapsPlugin;
