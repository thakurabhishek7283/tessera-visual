import type { TesseraContext } from '@tessera/core';
import type { MapsConfigValue } from './config.js';
import { createGeocoder } from './geocoder.js';
import { createMap } from './map.js';
import type { Geocoder, MapHandle, MapsApi } from './types.js';

/** The `maps` feature API. */
export function createMapsApi(
  ctx: TesseraContext,
  config: MapsConfigValue,
): MapsApi & { dispose(): void } {
  const open = new Set<MapHandle>();
  let geocoder: Geocoder | undefined;
  return {
    config,
    async create(el, opts) {
      const handle = await createMap(ctx, config, el, opts);
      open.add(handle);
      const destroy = handle.destroy.bind(handle);
      handle.destroy = () => {
        open.delete(handle);
        destroy();
      };
      return handle;
    },
    geocoder() {
      geocoder ??= createGeocoder(config.geocoder);
      return geocoder;
    },
    dispose() {
      for (const handle of [...open]) handle.destroy();
    },
  };
}
