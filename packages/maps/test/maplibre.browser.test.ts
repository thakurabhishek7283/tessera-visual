import { createTestInstance } from '@tessera/testing';
import { until } from '@tessera-internal/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { MapsApi } from '../src/index.js';
import { configureMapLibre } from '../src/maplibre.js';

// These tests run the real MapLibre GL JS (WebGL, in Chromium) against an inline style with no
// tiles, so they need no network. They check the parts a test double cannot: that the sources,
// layers, expressions and calls this kit makes are ones MapLibre accepts.

const style = `data:application/json,${encodeURIComponent(
  JSON.stringify({
    version: 8,
    sources: {},
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#d6e4f0' } }],
  }),
)}`;

const webgl = ((): boolean => {
  const canvas = document.createElement('canvas');
  return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
})();

afterEach(() => {
  configureMapLibre(undefined);
  document.body.replaceChildren();
});

describe.skipIf(!webgl)('real MapLibre', () => {
  async function open(features: Record<string, unknown> = {}) {
    configureMapLibre(undefined);
    const { instance } = await createTestInstance(
      {
        features: {
          maps: { enabled: true, styleUrl: style, center: [8.5, 47.4], zoom: 4, ...features },
        },
      },
      { maps: () => import('../src/plugin.js') },
    );
    const api = instance.feature('maps') as MapsApi;
    const host = document.createElement('div');
    host.style.cssText = 'width:640px;height:420px;position:relative';
    document.body.append(host);
    const handle = await api.create(host);
    const map = handle.raw() as {
      isStyleLoaded(): boolean;
      getSource(id: string): unknown;
      getLayer(id: string): unknown;
      querySourceFeatures(id: string): Array<{ properties: Record<string, unknown> }>;
      getZoom(): number;
      project(lngLat: [number, number]): { x: number; y: number };
      once(type: string, fn: () => void): void;
      getFeatureState(f: { source: string; id: string }): Record<string, unknown>;
    };
    await new Promise<void>((resolve) =>
      map.isStyleLoaded() ? resolve() : map.once('load', resolve),
    );
    return { handle, map, host, instance };
  }

  it('draws markers as clusters and points from one GeoJSON source', async () => {
    const { handle, map } = await open();
    handle.setMarkers([
      { id: 'a', lng: 8.5, lat: 47.4, title: 'A', color: 'danger' },
      { id: 'b', lng: 8.51, lat: 47.41 },
      { id: 'c', lng: 2.35, lat: 48.85 },
    ]);
    expect(map.getSource('tessera-markers')).toBeTruthy();
    for (const id of ['tessera-clusters', 'tessera-cluster-counts', 'tessera-points']) {
      expect(map.getLayer(id), id).toBeTruthy();
    }
    await until(() => map.querySourceFeatures('tessera-markers').length > 0);
    handle.destroy();
  });

  it('highlights a marker through feature state keyed by its own id', async () => {
    const { handle, map } = await open({ cluster: { enabled: false, radius: 50, maxZoom: 14 } });
    handle.setMarkers([{ id: 'a', lng: 8.5, lat: 47.4 }]);
    handle.setSelected('a');
    expect(map.getFeatureState({ source: 'tessera-markers', id: 'a' })).toEqual({ selected: true });
    handle.setSelected(null);
    expect(map.getFeatureState({ source: 'tessera-markers', id: 'a' })).toEqual({});
    handle.destroy();
  });

  it('fits to the markers and reports the bounds when it has stopped', async () => {
    const { handle } = await open();
    handle.setMarkers([
      { id: 'a', lng: 8.5, lat: 47.4 },
      { id: 'b', lng: 13.4, lat: 52.5 },
    ]);
    handle.fitToMarkers(20);
    const bounds = await new Promise<[[number, number], [number, number]]>((resolve) => {
      const off = handle.on('move-end', (e) => {
        if (e.bounds[0][0] < 8.5 && e.bounds[1][0] > 13.4) {
          off();
          resolve(e.bounds);
        }
      });
    });
    expect(bounds[1][1]).toBeGreaterThan(52.5);
    expect(handle.bounds.get()).not.toBeNull();
    handle.destroy();
  });

  it('places a draggable pin and a popup without errors', async () => {
    const { handle, host } = await open();
    handle.setMarkers([{ id: 'a', lng: 8.5, lat: 47.4 }]);
    handle.setPin({ lng: 8.5, lat: 47.4 }, { draggable: true, label: 'Here' });
    handle.openPopup('a', 'Hello');
    expect(host.querySelector('[aria-label=Here]')).not.toBeNull();
    expect(host.querySelector('.maplibregl-popup')?.textContent).toContain('Hello');
    handle.closePopup();
    expect(host.querySelector('.maplibregl-popup')).toBeNull();
    handle.setPin(null);
    expect(host.querySelector('[aria-label=Here]')).toBeNull();
    handle.destroy();
  });

  it('keeps attribution on the map', async () => {
    const { handle, host } = await open();
    expect(host.querySelector('.maplibregl-ctrl-attrib')).not.toBeNull();
    handle.destroy();
  });

  it('puts the layers back after the style changes', async () => {
    const { handle, map, instance } = await open({
      darkStyleUrl: style.replace('d6e4f0', '1b2735'),
    });
    handle.setMarkers([{ id: 'a', lng: 8.5, lat: 47.4 }]);
    instance.setTheme('dark');
    await new Promise<void>((resolve) => {
      const check = (): void =>
        map.getSource('tessera-markers') ? resolve() : void setTimeout(check, 50);
      check();
    });
    expect(map.getLayer('tessera-points')).toBeTruthy();
    handle.destroy();
  });
});
