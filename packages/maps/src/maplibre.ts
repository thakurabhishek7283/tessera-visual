import type { Unsubscribe } from '@tessera/core';

/** The slice of MapLibre GL JS this kit uses, so a test double or a custom build can stand in. */
export interface MLEventful {
  on(type: string, ...args: unknown[]): unknown;
  off(type: string, ...args: unknown[]): unknown;
  once(type: string, ...args: unknown[]): unknown;
}

export interface MLPopup extends MLEventful {
  setLngLat(lngLat: [number, number]): MLPopup;
  setDOMContent(node: Node): MLPopup;
  addTo(map: MLMap): MLPopup;
  remove(): MLPopup;
}

export interface MLMarker extends MLEventful {
  setLngLat(lngLat: [number, number]): MLMarker;
  getLngLat(): { lng: number; lat: number };
  addTo(map: MLMap): MLMarker;
  remove(): MLMarker;
  getElement(): HTMLElement;
}

export interface MLGeoJSONSource {
  setData(data: unknown): void;
  getClusterExpansionZoom(clusterId: number): Promise<number>;
}

export interface MLMap extends MLEventful {
  addControl(control: unknown, position?: string): unknown;
  addSource(id: string, source: unknown): unknown;
  addLayer(layer: unknown): unknown;
  getSource(id: string): MLGeoJSONSource | undefined;
  getLayer(id: string): unknown;
  removeLayer(id: string): unknown;
  removeSource(id: string): unknown;
  setStyle(style: string): unknown;
  isStyleLoaded(): boolean;
  setFeatureState(feature: { source: string; id: string }, state: Record<string, unknown>): void;
  removeFeatureState(feature: { source: string; id?: string }): void;
  queryRenderedFeatures(point?: unknown, options?: { layers?: string[] }): unknown[];
  easeTo(options: { center?: [number, number]; zoom?: number; duration?: number }): unknown;
  flyTo(options: { center: [number, number]; zoom?: number }): unknown;
  fitBounds(
    bounds: [[number, number], [number, number]],
    options?: { padding?: number; maxZoom?: number; duration?: number },
  ): unknown;
  getBounds(): { toArray(): [[number, number], [number, number]] };
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getCanvas(): HTMLCanvasElement;
  resize(): unknown;
  remove(): void;
}

export interface MapLibreModule {
  Map: new (options: Record<string, unknown>) => MLMap;
  Popup: new (options?: Record<string, unknown>) => MLPopup;
  Marker: new (options?: Record<string, unknown>) => MLMarker;
  NavigationControl: new (options?: Record<string, unknown>) => unknown;
  GeolocateControl: new (options?: Record<string, unknown>) => unknown;
  FullscreenControl: new (options?: Record<string, unknown>) => unknown;
  ScaleControl: new (options?: Record<string, unknown>) => unknown;
  AttributionControl: new (options?: Record<string, unknown>) => unknown;
  /** MapLibre 4+: where the web worker script is. */
  setWorkerUrl?(url: string): void;
}

export interface LoadedMapLibre {
  lib: MapLibreModule;
  /** Stylesheet text, adopted into the root the map lives in. */
  css: string;
}

export type MapLibreLoader = () => Promise<LoadedMapLibre>;

const defaultLoader: MapLibreLoader = async () => {
  // Two lazy chunks: MapLibre itself and its stylesheet. Nothing of either is fetched until a map opens.
  const [mod, css] = await Promise.all([
    import('maplibre-gl'),
    import('./maplibre-css.generated.js'),
  ]);
  const lib = (mod as { default?: unknown }).default ?? mod;
  return { lib: lib as unknown as MapLibreModule, css: css.maplibreCss };
};

let loader: MapLibreLoader = defaultLoader;
let loading: Promise<LoadedMapLibre> | undefined;

/**
 * Replaces how MapLibre is loaded: a build you host yourself, an eager import, or a test double.
 * Call it before the first map opens; `undefined` restores the lazy default.
 */
export function configureMapLibre(next: MapLibreLoader | undefined): void {
  loader = next ?? defaultLoader;
  loading = undefined;
}

export function loadMapLibre(): Promise<LoadedMapLibre> {
  loading ??= loader().catch((error: unknown) => {
    // A failed load (offline) must not stick: the next map gets a fresh try.
    loading = undefined;
    throw error;
  });
  return loading;
}

const adopted = new WeakSet<Document | ShadowRoot>();

/** Adds the MapLibre stylesheet to the document or shadow root a map lives in, once. */
export function injectCss(root: Document | ShadowRoot, css: string): void {
  if (adopted.has(root)) return;
  adopted.add(root);
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  } catch {
    const style = document.createElement('style');
    style.setAttribute('data-tessera-maplibre', '');
    style.textContent = css;
    (root instanceof Document ? root.head : root).append(style);
  }
}

export type { Unsubscribe };
