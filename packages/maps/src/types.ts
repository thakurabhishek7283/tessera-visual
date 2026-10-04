import type { ReadonlyStore, Unsubscribe } from '@tessera-kit/core';
import type { MapsConfigValue } from './config.js';

/** `[[west, south], [east, north]]` */
export type LngLatBounds = [[number, number], [number, number]];

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  title?: string;
  /** A theme colour (`primary`, `danger`, `warning`, `success`) or any CSS colour. */
  color?: string;
  /** Anything the host wants back in events and popups. */
  data?: Record<string, unknown>;
}

export interface MapEventMap {
  'marker-click': { marker: MapMarker };
  'cluster-click': { lng: number; lat: number; count: number };
  'move-end': { center: [number, number]; zoom: number; bounds: LngLatBounds };
  click: { lng: number; lat: number };
  /** The draggable pin was dropped. */
  'pin-move': { lng: number; lat: number };
}

export interface PinOptions {
  draggable?: boolean;
  /** Accessible name of the pin. */
  label?: string;
  color?: string;
}

export interface MapHandle {
  /** Replaces the markers. They are drawn as a map layer, so thousands stay fast. */
  setMarkers(markers: readonly MapMarker[]): void;
  /** Zooms to show every marker. `padding` is in pixels. */
  fitToMarkers(padding?: number): void;
  flyTo(lng: number, lat: number, zoom?: number): void;
  /** Highlights one marker (or none). */
  setSelected(id: string | null): void;
  /** Places one extra pin, e.g. a chosen location. `null` removes it. */
  setPin(at: { lng: number; lat: number } | null, opts?: PinOptions): void;
  /** Visible area, updated when the map stops moving. `null` until the first time. */
  readonly bounds: ReadonlyStore<LngLatBounds | null>;
  on<K extends keyof MapEventMap>(event: K, fn: (e: MapEventMap[K]) => void): Unsubscribe;
  /** Shows a popup at a marker. A string is shown as text, never as markup. */
  openPopup(markerId: string, content: HTMLElement | string): void;
  closePopup(): void;
  /** Tells the map its container changed size. */
  resize(): void;
  /** Sets the accessible name of the map (its canvas is the one region assistive technology sees). */
  setLabel(label: string): void;
  /** The underlying MapLibre map, as an escape hatch. */
  raw(): unknown;
  destroy(): void;
}

export interface GeocodeResult {
  label: string;
  lng: number;
  lat: number;
  /** `[west, south, east, north]` */
  bbox?: [number, number, number, number];
}

export interface SearchOptions {
  limit?: number;
  signal?: AbortSignal;
  /** Prefer results near this `[lng, lat]`. */
  bias?: [number, number];
}

export interface Geocoder {
  search(q: string, opts?: SearchOptions): Promise<GeocodeResult[]>;
  reverse(
    lng: number,
    lat: number,
    opts?: { signal?: AbortSignal },
  ): Promise<{ label: string } | null>;
}

export interface MapsApi {
  readonly config: MapsConfigValue;
  /**
   * Mounts a map into `el` (which needs a size). MapLibre is loaded the first time and its
   * stylesheet is added to the root `el` lives in, shadow roots included.
   *
   * @example
   * const map = await api.create(el, { center: [8.54, 47.37], zoom: 11 });
   * map.setMarkers([{ id: 'a', lng: 8.54, lat: 47.37, title: 'Zürich' }]);
   */
  create(el: HTMLElement, opts?: Partial<Omit<MapsConfigValue, 'enabled'>>): Promise<MapHandle>;
  /** The shared geocoder: one queue, so the provider's rate limit holds across maps. */
  geocoder(): Geocoder;
}

declare module '@tessera-kit/core' {
  interface FeatureApiMap {
    maps: MapsApi;
  }
  interface ServiceMap {
    maps: MapsApi;
  }
}
