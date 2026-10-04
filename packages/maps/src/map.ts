import {
  createStore,
  type Store,
  type TesseraContext,
  TesseraError,
  type Unsubscribe,
} from '@tessera-kit/core';
import type { MapsConfigValue } from './config.js';
import { boundsOf, mapColor, markersToGeoJSON } from './geojson.js';
import { injectCss, loadMapLibre, type MLMap, type MLMarker, type MLPopup } from './maplibre.js';
import type { LngLatBounds, MapEventMap, MapHandle, MapMarker, PinOptions } from './types.js';

const SOURCE = 'tessera-markers';
const L_CLUSTERS = 'tessera-clusters';
const L_COUNTS = 'tessera-cluster-counts';
const L_POINTS = 'tessera-points';
const BOUNDS_DEBOUNCE_MS = 250;

type Listener = (e: never) => void;

/** Which style applies for the resolved theme. */
export function styleFor(config: MapsConfigValue, theme: 'light' | 'dark'): string {
  return theme === 'dark' && config.darkStyleUrl ? config.darkStyleUrl : config.styleUrl;
}

function resolvedTheme(ctx: TesseraContext): 'light' | 'dark' {
  const mode = ctx.config.theme?.mode ?? 'auto';
  if (mode !== 'auto') return mode;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Opens a map in `el`. MapLibre loads on first use; markers are one GeoJSON source drawn by
 * circle layers (clustered when configured), so a few thousand stay smooth.
 */
export async function createMap(
  ctx: TesseraContext,
  featureConfig: MapsConfigValue,
  el: HTMLElement,
  overrides: Partial<Omit<MapsConfigValue, 'enabled'>> = {},
): Promise<MapHandle> {
  const config: MapsConfigValue = { ...featureConfig, ...overrides, enabled: true };
  const { lib, css } = await loadMapLibre().catch((error: unknown) => {
    throw new TesseraError('UNKNOWN', 'The map library could not be loaded', { cause: error });
  });
  injectCss(el.getRootNode() as Document | ShadowRoot, css);
  if (config.workerUrl) lib.setWorkerUrl?.(config.workerUrl);

  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;inset:0;';
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.append(container);

  let theme = resolvedTheme(ctx);
  const read = (name: string): string => getComputedStyle(container).getPropertyValue(name).trim();
  const color = (v: string | undefined): string => mapColor(v, read);

  const map = new lib.Map({
    container,
    style: styleFor(config, theme),
    center: config.center,
    zoom: config.zoom,
    // Attribution is added below as a control that cannot be turned off.
    attributionControl: false,
  });
  map.addControl(new lib.AttributionControl({ compact: true }), 'bottom-right');
  if (config.controls.navigation) map.addControl(new lib.NavigationControl({}), 'top-right');
  if (config.controls.geolocate) {
    map.addControl(
      new lib.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      'top-right',
    );
  }
  if (config.controls.fullscreen) map.addControl(new lib.FullscreenControl({}), 'top-right');
  if (config.controls.scale) map.addControl(new lib.ScaleControl({}), 'bottom-left');

  const listeners = new Map<keyof MapEventMap, Set<Listener>>();
  const emit = <K extends keyof MapEventMap>(event: K, payload: MapEventMap[K]): void => {
    for (const fn of [...(listeners.get(event) ?? [])]) {
      try {
        (fn as (e: MapEventMap[K]) => void)(payload);
      } catch (error) {
        ctx.logger.error(`a "${event}" listener threw`, error);
      }
    }
  };

  const bounds: Store<LngLatBounds | null> = createStore<LngLatBounds | null>(null);
  let markers: MapMarker[] = [];
  const byId = new Map<string, MapMarker>();
  let selected: string | null = null;
  let popup: MLPopup | undefined;
  let pin: MLMarker | undefined;
  let destroyed = false;
  let styleReady = false;

  const paint = (): void => {
    const source = map.getSource(SOURCE);
    if (source) source.setData(markersToGeoJSON(markers, color));
  };

  const applySelected = (): void => {
    if (!styleReady || !map.getSource(SOURCE)) return;
    map.removeFeatureState({ source: SOURCE });
    if (selected !== null && byId.has(selected)) {
      map.setFeatureState({ source: SOURCE, id: selected }, { selected: true });
    }
  };

  /** (Re)creates the marker source and layers. Runs again after every style change. */
  const install = (): void => {
    if (destroyed) return;
    styleReady = true;
    const primary = color('primary');
    map.addSource(SOURCE, {
      type: 'geojson',
      data: markersToGeoJSON(markers, color),
      promoteId: 'id',
      cluster: config.cluster.enabled,
      clusterRadius: config.cluster.radius,
      clusterMaxZoom: config.cluster.maxZoom,
    });
    if (config.cluster.enabled) {
      map.addLayer({
        id: L_CLUSTERS,
        type: 'circle',
        source: SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': primary,
          'circle-opacity': 0.85,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26, 200, 32],
        },
      });
      map.addLayer({
        id: L_COUNTS,
        type: 'symbol',
        source: SOURCE,
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13 },
        paint: { 'text-color': read('--tessera-color-primary-contrast') || '#ffffff' },
      });
    }
    map.addLayer({
      id: L_POINTS,
      type: 'circle',
      source: SOURCE,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 11, 8],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 2],
      },
    });
    applySelected();
  };

  const ready = new Promise<void>((resolve) => {
    map.once('load', () => {
      install();
      map.on('style.load', () => {
        // setStyle drops our layers; put them back.
        if (!map.getSource(SOURCE)) install();
      });
      resolve();
    });
  });

  // Interaction.
  const pointer = (on: boolean) => (): void => {
    map.getCanvas().style.cursor = on ? 'pointer' : '';
  };
  map.on('mouseenter', L_POINTS, pointer(true));
  map.on('mouseleave', L_POINTS, pointer(false));
  map.on('mouseenter', L_CLUSTERS, pointer(true));
  map.on('mouseleave', L_CLUSTERS, pointer(false));

  type Hit = {
    features?: Array<{ properties?: Record<string, unknown> }>;
    lngLat: { lng: number; lat: number };
  };
  map.on('click', L_POINTS, (e: Hit) => {
    const id = e.features?.[0]?.properties?.id;
    const marker = typeof id === 'string' ? byId.get(id) : undefined;
    if (marker) emit('marker-click', { marker });
  });
  map.on('click', L_CLUSTERS, (e: Hit) => {
    const props = e.features?.[0]?.properties;
    const clusterId = props?.cluster_id;
    const count = Number(props?.point_count ?? 0);
    const { lng, lat } = e.lngLat;
    emit('cluster-click', { lng, lat, count });
    if (typeof clusterId !== 'number') return;
    void map
      .getSource(SOURCE)
      ?.getClusterExpansionZoom(clusterId)
      .then((zoom) => {
        if (!destroyed) map.easeTo({ center: [lng, lat], zoom });
      });
  });
  map.on('click', (e: Hit) => {
    // Marker and cluster clicks also reach the map; only report empty-space clicks.
    const hit = map.queryRenderedFeatures((e as unknown as { point?: unknown }).point, {
      layers: [L_POINTS, L_CLUSTERS].filter((id) => map.getLayer(id)),
    });
    if (hit.length === 0) emit('click', { lng: e.lngLat.lng, lat: e.lngLat.lat });
  });

  let moveTimer: ReturnType<typeof setTimeout> | undefined;
  const reportMove = (): void => {
    if (destroyed) return;
    const box = map.getBounds().toArray();
    bounds.set(box);
    const c = map.getCenter();
    emit('move-end', { center: [c.lng, c.lat], zoom: map.getZoom(), bounds: box });
  };
  map.on('moveend', () => {
    if (moveTimer !== undefined) clearTimeout(moveTimer);
    moveTimer = setTimeout(reportMove, BOUNDS_DEBOUNCE_MS);
  });
  void ready.then(reportMove);

  /** Removes the marker layers and source, e.g. to draw them again in other colours. */
  const uninstall = (): void => {
    for (const id of [L_COUNTS, L_CLUSTERS, L_POINTS]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  };

  let currentStyle = styleFor(config, theme);
  const offs: Unsubscribe[] = [
    ctx.bus.on('tessera:theme-changed', ({ resolved }) => {
      if (resolved === theme) return;
      theme = resolved;
      const next = styleFor(config, theme);
      if (next !== currentStyle) {
        currentStyle = next;
        styleReady = false;
        // The new style has none of our layers; the `style.load` handler adds them back.
        map.setStyle(next);
      } else if (styleReady) {
        // Same style, new theme colours: draw the markers again.
        uninstall();
        install();
      }
    }),
  ];

  const closePopup = (): void => {
    popup?.remove();
    popup = undefined;
  };

  const handle: MapHandle = {
    setMarkers(next) {
      markers = [...next];
      byId.clear();
      for (const m of markers) byId.set(m.id, m);
      if (selected !== null && !byId.has(selected)) selected = null;
      if (map.getSource(SOURCE)) {
        paint();
        applySelected();
      }
    },
    fitToMarkers(padding = 48) {
      const box = boundsOf(markers);
      if (!box) return;
      const [[w, s], [e, n]] = box;
      void ready.then(() => {
        if (destroyed) return;
        // One marker has no extent: centre on it instead of zooming to infinity.
        if (w === e && s === n) map.easeTo({ center: [w, s], zoom: Math.max(map.getZoom(), 12) });
        else map.fitBounds(box, { padding, maxZoom: 15, duration: 400 });
      });
    },
    flyTo(lng, lat, zoom) {
      map.flyTo({ center: [lng, lat], ...(zoom !== undefined ? { zoom } : {}) });
    },
    setSelected(id) {
      selected = id;
      applySelected();
    },
    setPin(at, opts: PinOptions = {}) {
      pin?.remove();
      pin = undefined;
      if (!at) return;
      const marker = new lib.Marker({
        draggable: opts.draggable ?? false,
        color: color(opts.color),
      });
      marker.setLngLat([at.lng, at.lat]).addTo(map);
      const element = marker.getElement();
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', opts.label ?? 'Selected location');
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        emit('pin-move', { lng: p.lng, lat: p.lat });
      });
      pin = marker;
    },
    bounds,
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(fn as Listener);
      return () => set.delete(fn as Listener);
    },
    openPopup(markerId, content) {
      const marker = byId.get(markerId);
      if (!marker) return;
      closePopup();
      const node = typeof content === 'string' ? document.createTextNode(content) : content;
      const holder = document.createElement('div');
      holder.append(node);
      popup = new lib.Popup({ offset: 14, closeButton: true, maxWidth: '280px' });
      popup.setLngLat([marker.lng, marker.lat]).setDOMContent(holder).addTo(map);
    },
    closePopup,
    resize() {
      map.resize();
    },
    setLabel(label) {
      map.getCanvas().setAttribute('aria-label', label);
    },
    raw: () => map as unknown,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (moveTimer !== undefined) clearTimeout(moveTimer);
      for (const off of offs) off();
      closePopup();
      pin?.remove();
      listeners.clear();
      map.remove();
      container.remove();
    },
  };
  return handle;
}

export type { MLMap };
