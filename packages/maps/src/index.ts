export { MapsConfig, type MapsConfigValue } from './config.js';
export { createGeocoder, createRateLimiter } from './geocoder.js';
export { boundsOf, markersToGeoJSON } from './geojson.js';
export { configureMapLibre, type LoadedMapLibre, type MapLibreLoader } from './maplibre.js';
export { mapsPlugin as default, mapsPlugin } from './plugin.js';
export type {
  GeocodeResult,
  Geocoder,
  LngLatBounds,
  MapEventMap,
  MapHandle,
  MapMarker,
  MapsApi,
  PinOptions,
  SearchOptions,
} from './types.js';
