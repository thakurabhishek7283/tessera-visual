import { createTestInstance, type TestInstance } from '@tessera/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapHandle, MapsApi } from '../src/index.js';
import { configureMapLibre } from '../src/maplibre.js';
import { createFakeMapLibre, type Fake, type FakeMap } from './fake-maplibre.js';

let fake: Fake;
let test: TestInstance;
const cleanups: Array<() => void> = [];

beforeEach(() => {
  fake = createFakeMapLibre();
  configureMapLibre(async () => fake.loaded);
});

afterEach(async () => {
  for (const c of cleanups.splice(0)) c();
  await test?.instance.destroy();
  configureMapLibre(undefined);
  document.body.replaceChildren();
});

async function setup(features: Record<string, unknown> = {}, theme?: 'light' | 'dark') {
  test = await createTestInstance(
    {
      features: { maps: { enabled: true, ...features } },
      ...(theme ? { theme: { mode: theme } } : {}),
    },
    { maps: () => import('../src/plugin.js') },
  );
  const api = test.instance.feature('maps') as MapsApi;
  const host = document.createElement('div');
  host.style.cssText = 'width:600px;height:400px';
  document.body.append(host);
  return { api, host };
}

async function open(features: Record<string, unknown> = {}, theme?: 'light' | 'dark') {
  const { api, host } = await setup(features, theme);
  const handle = await api.create(host);
  cleanups.push(() => handle.destroy());
  const map = fake.map();
  return { api, host, handle, map };
}

/** The features currently in the marker source. */
const features = (map: FakeMap): Array<{ properties: { id: string; color: string } }> =>
  (
    map.sources.get('tessera-markers')?.data as
      | { features?: Array<{ properties: { id: string; color: string } }> }
      | undefined
  )?.features ?? [];

const feature = (id: string, extra: Record<string, unknown> = {}) => ({
  properties: { id, ...extra },
});

describe('createMap', () => {
  it('builds a map with the configured style, centre, zoom and controls, and always shows attribution', async () => {
    const { map } = await open({
      center: [8.5, 47.4],
      zoom: 9,
      controls: { navigation: true, geolocate: false, fullscreen: true, scale: true },
    });
    expect(map.options).toMatchObject({
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [8.5, 47.4],
      zoom: 9,
      attributionControl: false,
    });
    expect(map.controls.map((c) => c.kind)).toEqual([
      'attribution',
      'navigation',
      'fullscreen',
      'scale',
    ]);
  });

  it('puts the map inside the host and removes it on destroy', async () => {
    const { host, handle, map } = await open();
    expect(host.children).toHaveLength(1);
    handle.destroy();
    expect(host.children).toHaveLength(0);
    expect(map.removed).toBe(true);
    handle.destroy();
  });

  it('adds the MapLibre stylesheet once per root, in a shadow root too', async () => {
    const { api, host } = await setup();
    const shadowHost = document.createElement('div');
    document.body.append(shadowHost);
    const shadow = shadowHost.attachShadow({ mode: 'open' });
    const inner = document.createElement('div');
    shadow.append(inner);
    const a = await api.create(host);
    const afterFirst = document.adoptedStyleSheets.length;
    const b = await api.create(host);
    const c = await api.create(inner);
    // The document already has it; only the shadow root, a separate style scope, needs its own.
    expect(document.adoptedStyleSheets.length).toBe(afterFirst);
    expect(afterFirst).toBeGreaterThan(0);
    expect(shadow.adoptedStyleSheets).toHaveLength(1);
    for (const h of [a, b, c]) h.destroy();
  });

  it('fails clearly when MapLibre cannot be loaded, and tries again next time', async () => {
    const { api, host } = await setup();
    configureMapLibre(
      vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(fake.loaded),
    );
    await expect(api.create(host)).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: expect.stringContaining('map library'),
    });
    const handle = await api.create(host);
    expect(fake.maps).toHaveLength(1);
    handle.destroy();
  });

  it('uses the dark style when the theme is dark and a dark style is configured', async () => {
    const { map } = await open({ darkStyleUrl: 'https://example.com/dark.json' }, 'dark');
    expect(map.options.style).toBe('https://example.com/dark.json');
  });
});

describe('markers', () => {
  it('draws the markers once the style has loaded, clustered by the configuration', async () => {
    const { handle, map } = await open({ cluster: { enabled: true, radius: 40, maxZoom: 12 } });
    handle.setMarkers([
      { id: 'a', lng: 8.5, lat: 47.4, title: 'A', color: 'danger' },
      { id: 'b', lng: 9, lat: 46 },
    ]);
    expect(map.sources.size).toBe(0);
    map.finishLoading();
    const source = map.sources.get('tessera-markers');
    expect(source?.spec).toMatchObject({
      type: 'geojson',
      cluster: true,
      clusterRadius: 40,
      clusterMaxZoom: 12,
      promoteId: 'id',
    });
    expect(features(map)).toHaveLength(2);
    expect(map.layers.map((l) => l.id)).toEqual([
      'tessera-clusters',
      'tessera-cluster-counts',
      'tessera-points',
    ]);
  });

  it('uses no cluster layers when clustering is off', async () => {
    const { map } = await open({ cluster: { enabled: false, radius: 50, maxZoom: 14 } });
    map.finishLoading();
    expect(map.layers.map((l) => l.id)).toEqual(['tessera-points']);
    expect(map.sources.get('tessera-markers')?.spec.cluster).toBe(false);
  });

  it('resolves theme colours to concrete ones, which MapLibre can paint', async () => {
    const { handle, map } = await open();
    document.documentElement.style.setProperty('--tessera-color-danger', '#b91c1c');
    handle.setMarkers([{ id: 'a', lng: 1, lat: 1, color: 'danger' }]);
    map.finishLoading();
    const data = map.sources.get('tessera-markers')?.data as {
      features: Array<{ properties: { color: string } }>;
    };
    expect(data.features[0]?.properties.color).toBe('#b91c1c');
    document.documentElement.style.removeProperty('--tessera-color-danger');
  });

  it('updates the source when markers change after loading', async () => {
    const { handle, map } = await open();
    map.finishLoading();
    handle.setMarkers([{ id: 'a', lng: 1, lat: 1 }]);
    handle.setMarkers([
      { id: 'a', lng: 1, lat: 1 },
      { id: 'b', lng: 2, lat: 2 },
    ]);
    expect(map.calls.filter((c) => c[0] === 'setData')).toHaveLength(2);
    expect(features(map)).toHaveLength(2);
  });

  it('reports a click on a marker with the marker the host gave, and ignores unknown ids', async () => {
    const { handle, map } = await open();
    const seen: unknown[] = [];
    handle.on('marker-click', (e) => seen.push(e.marker));
    handle.setMarkers([{ id: 'a', lng: 1, lat: 1, title: 'Alpha', data: { price: 12 } }]);
    map.finishLoading();
    map.fire('click', { features: [feature('a')], lngLat: { lng: 1, lat: 1 } }, 'tessera-points');
    map.fire(
      'click',
      { features: [feature('ghost')], lngLat: { lng: 1, lat: 1 } },
      'tessera-points',
    );
    expect(seen).toEqual([{ id: 'a', lng: 1, lat: 1, title: 'Alpha', data: { price: 12 } }]);
  });

  it('zooms into a cluster that is clicked', async () => {
    const { handle, map } = await open();
    const seen: unknown[] = [];
    handle.on('cluster-click', (e) => seen.push(e));
    map.finishLoading();
    map.expansionZoom = 9;
    map.fire(
      'click',
      { features: [feature('x', { cluster_id: 5, point_count: 12 })], lngLat: { lng: 3, lat: 4 } },
      'tessera-clusters',
    );
    await vi.waitFor(() => expect(map.calls.find((c) => c[0] === 'easeTo')).toBeDefined());
    expect(map.calls.find((c) => c[0] === 'easeTo')?.[1]).toEqual({ center: [3, 4], zoom: 9 });
    expect(seen).toEqual([{ lng: 3, lat: 4, count: 12 }]);
  });

  it('reports clicks on empty map only', async () => {
    const { handle, map } = await open();
    const seen: unknown[] = [];
    handle.on('click', (e) => seen.push(e));
    map.finishLoading();
    map.hits = [{}];
    map.fire('click', { lngLat: { lng: 1, lat: 2 } });
    map.hits = [];
    map.fire('click', { lngLat: { lng: 5, lat: 6 } });
    expect(seen).toEqual([{ lng: 5, lat: 6 }]);
  });

  it('shows a pointer cursor over markers and clusters', async () => {
    const { map } = await open();
    map.fire('mouseenter', {}, 'tessera-points');
    expect(map.canvas.style.cursor).toBe('pointer');
    map.fire('mouseleave', {}, 'tessera-points');
    expect(map.canvas.style.cursor).toBe('');
  });

  it('highlights the selected marker with feature state, keeps it across updates and drops it when the marker goes', async () => {
    const { handle, map } = await open();
    handle.setMarkers([
      { id: 'a', lng: 1, lat: 1 },
      { id: 'b', lng: 2, lat: 2 },
    ]);
    map.finishLoading();
    handle.setSelected('b');
    expect([...map.featureState.keys()]).toEqual(['b']);
    handle.setMarkers([
      { id: 'a', lng: 1, lat: 1 },
      { id: 'b', lng: 2, lat: 2 },
    ]);
    expect([...map.featureState.keys()]).toEqual(['b']);
    handle.setMarkers([{ id: 'a', lng: 1, lat: 1 }]);
    expect([...map.featureState.keys()]).toEqual([]);
    handle.setSelected(null);
    expect([...map.featureState.keys()]).toEqual([]);
  });

  it('survives a bad marker among good ones', async () => {
    const { handle, map } = await open();
    handle.setMarkers([
      { id: 'ok', lng: 1, lat: 1 },
      { id: 'bad', lng: Number.NaN, lat: 1 },
    ]);
    map.finishLoading();
    expect(features(map)).toHaveLength(1);
  });
});

describe('view', () => {
  it('fits to the markers with padding, centres on a single one, and does nothing without any', async () => {
    const { handle, map } = await open();
    map.finishLoading();
    handle.fitToMarkers();
    await vi.waitFor(() => expect(map.calls).toHaveLength(0));
    handle.setMarkers([
      { id: 'a', lng: 1, lat: 2 },
      { id: 'b', lng: 5, lat: 6 },
    ]);
    handle.fitToMarkers(30);
    await vi.waitFor(() => expect(map.calls.find((c) => c[0] === 'fitBounds')).toBeDefined());
    expect(map.calls.find((c) => c[0] === 'fitBounds')?.slice(1)).toEqual([
      [
        [1, 2],
        [5, 6],
      ],
      { padding: 30, maxZoom: 15, duration: 400 },
    ]);
    map.calls.length = 0;
    handle.setMarkers([{ id: 'a', lng: 1, lat: 2 }]);
    handle.fitToMarkers();
    await vi.waitFor(() => expect(map.calls.find((c) => c[0] === 'easeTo')).toBeDefined());
    expect(map.calls.find((c) => c[0] === 'easeTo')?.[1]).toEqual({ center: [1, 2], zoom: 12 });
  });

  it('flies to a place', async () => {
    const { handle, map } = await open();
    handle.flyTo(8.5, 47.4, 12);
    handle.flyTo(1, 2);
    expect(map.calls.filter((c) => c[0] === 'flyTo').map((c) => c[1])).toEqual([
      { center: [8.5, 47.4], zoom: 12 },
      { center: [1, 2] },
    ]);
  });

  it('reports the visible bounds once the map has stopped moving, debounced', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { handle, map } = await open();
      const moves: unknown[] = [];
      handle.on('move-end', (e) => moves.push(e));
      map.finishLoading();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(300);
      expect(handle.bounds.get()).toEqual([
        [-1, 19],
        [1, 21],
      ]);
      map.center = { lng: 10, lat: 10 };
      map.fire('moveend');
      map.fire('moveend');
      map.fire('moveend');
      await vi.advanceTimersByTimeAsync(249);
      expect(handle.bounds.get()).toEqual([
        [-1, 19],
        [1, 21],
      ]);
      await vi.advanceTimersByTimeAsync(2);
      expect(handle.bounds.get()).toEqual([
        [9, 9],
        [11, 11],
      ]);
      expect(moves).toHaveLength(2);
      expect(moves.at(-1)).toMatchObject({ center: [10, 10], zoom: 1.5 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells MapLibre when the container changed size', async () => {
    const { handle, map } = await open();
    handle.resize();
    expect(map.calls).toContainEqual(['resize']);
  });

  it('hands out the underlying map', async () => {
    const { handle, map } = await open();
    expect(handle.raw()).toBe(map);
  });
});

describe('popups and pins', () => {
  it('shows a popup at the marker, and shows a string as text, never as markup', async () => {
    const { handle } = await open();
    handle.setMarkers([{ id: 'a', lng: 3, lat: 4 }]);
    handle.openPopup('a', '<img src=x onerror=alert(1)>');
    const popup = fake.popups[0];
    expect(popup?.lngLat).toEqual([3, 4]);
    expect(popup?.content?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(
      popup?.content instanceof HTMLElement ? popup.content.querySelector('img') : null,
    ).toBeNull();
  });

  it('accepts an element, replaces the previous popup and closes it on request', async () => {
    const { handle } = await open();
    handle.setMarkers([
      { id: 'a', lng: 3, lat: 4 },
      { id: 'b', lng: 5, lat: 6 },
    ]);
    const node = document.createElement('b');
    node.textContent = 'hello';
    handle.openPopup('a', node);
    handle.openPopup('b', 'second');
    expect(fake.popups[0]?.removed).toBe(true);
    expect(fake.popups[0]?.content?.textContent).toBe('hello');
    handle.closePopup();
    expect(fake.popups[1]?.removed).toBe(true);
    handle.openPopup('ghost', 'x');
    expect(fake.popups).toHaveLength(2);
  });

  it('places a pin, reports where a draggable one is dropped and removes it', async () => {
    const { handle } = await open();
    const moves: unknown[] = [];
    handle.on('pin-move', (e) => moves.push(e));
    handle.setPin({ lng: 8.5, lat: 47.4 }, { draggable: true, label: 'Meeting point' });
    const pin = fake.markers[0];
    expect(pin?.options).toMatchObject({ draggable: true });
    expect(pin?.lngLat).toEqual({ lng: 8.5, lat: 47.4 });
    expect(pin?.element.getAttribute('aria-label')).toBe('Meeting point');
    pin?.drop(9, 48);
    expect(moves).toEqual([{ lng: 9, lat: 48 }]);
    handle.setPin(null);
    expect(pin?.removed).toBe(true);
    handle.setPin({ lng: 1, lat: 1 });
    expect(fake.markers).toHaveLength(2);
    expect(fake.markers[1]?.options).toMatchObject({ draggable: false });
  });
});

describe('theme', () => {
  it('switches style with the theme and puts the markers back once the new style has loaded', async () => {
    const { handle, map } = await open({ darkStyleUrl: 'https://example.com/dark.json' }, 'light');
    handle.setMarkers([{ id: 'a', lng: 1, lat: 1 }]);
    map.finishLoading();
    test.instance.setTheme('dark');
    expect(map.calls).toContainEqual(['setStyle', 'https://example.com/dark.json']);
    expect(map.sources.size).toBe(0);
    map.fire('style.load');
    expect(map.sources.has('tessera-markers')).toBe(true);
    expect(features(map)).toHaveLength(1);
    test.instance.setTheme('light');
    expect(map.calls.filter((c) => c[0] === 'setStyle').map((c) => c[1])).toEqual([
      'https://example.com/dark.json',
      'https://tiles.openfreemap.org/styles/liberty',
    ]);
  });

  it('draws the markers again in the new theme colours when there is only one style', async () => {
    const { handle, map } = await open({}, 'light');
    handle.setMarkers([{ id: 'a', lng: 1, lat: 1 }]);
    map.finishLoading();
    const first = map.sources.get('tessera-markers');
    test.instance.setTheme('dark');
    expect(map.calls.some((c) => c[0] === 'setStyle')).toBe(false);
    expect(map.sources.get('tessera-markers')).not.toBe(first);
  });
});

describe('events', () => {
  it('lets one listener fail without silencing the others, and stops after unsubscribing', async () => {
    const { handle, map } = await open();
    const ok = vi.fn();
    handle.on('click', () => {
      throw new Error('boom');
    });
    const off = handle.on('click', ok);
    map.finishLoading();
    map.fire('click', { lngLat: { lng: 1, lat: 2 } });
    expect(ok).toHaveBeenCalledOnce();
    off();
    map.fire('click', { lngLat: { lng: 1, lat: 2 } });
    expect(ok).toHaveBeenCalledOnce();
  });

  it('closes every open map when the feature is disabled', async () => {
    const { api, host } = await setup();
    const handle = await api.create(host);
    const map = fake.map();
    await test.instance.disable('maps');
    expect(map.removed).toBe(true);
    handle.destroy();
  });
});

describe('MapsApi.geocoder', () => {
  it('is one shared geocoder', async () => {
    const { api } = await setup();
    expect(api.geocoder()).toBe(api.geocoder());
  });

  it('finds nothing when the geocoder is none', async () => {
    const { api } = await setup({ geocoder: { type: 'none' } });
    expect(await api.geocoder().search('anything')).toEqual([]);
  });
});

export type { MapHandle };
