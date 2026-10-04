import '@tessera-kit/elements/define';
import { cleanup, until } from '@tessera-internal/test-utils';
import { TesseraProvider } from '@tessera-kit/react';
import { createTestInstance } from '@tessera-kit/testing';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureMapLibre } from '../src/maplibre.js';
import { LocationPicker, MapView, useGeocoder, useMapsApi } from '../src/react/index.js';
import { createFakeMapLibre, type Fake } from './fake-maplibre.js';

let fake: Fake;
beforeEach(() => {
  fake = createFakeMapLibre();
  configureMapLibre(async () => fake.loaded);
});
afterEach(() => {
  cleanup();
  configureMapLibre(undefined);
});

async function world() {
  const { instance } = await createTestInstance(
    { features: { maps: { enabled: true, geocoder: { type: 'none' } } } },
    { maps: () => import('../src/plugin.js') },
  );
  const container = document.createElement('div');
  document.body.append(container);
  return { instance, container, root: createRoot(container) };
}

describe('React maps bindings', () => {
  it('<MapView> shows markers, forwards clicks and moves the map when centre changes', async () => {
    const { instance, root } = await world();
    const onClick = vi.fn();
    const markers = [{ id: 'a', lng: 1, lat: 2, title: 'A' }];
    const render = (center: [number, number]) =>
      root.render(
        <TesseraProvider instance={instance}>
          <MapView
            markers={markers}
            center={center}
            zoom={5}
            label="Sites"
            onMarkerClick={onClick}
          />
        </TesseraProvider>,
      );
    render([1, 2]);
    await until(() => fake.maps.length > 0);
    const map = fake.map();
    map.finishLoading();
    await until(() => map.sources.get('tessera-markers'));
    map.fire(
      'click',
      { features: [{ properties: { id: 'a' } }], lngLat: { lng: 1, lat: 2 } },
      'tessera-points',
    );
    await until(() => onClick.mock.calls.length === 1);
    expect(onClick.mock.calls[0]?.[0].detail.marker.id).toBe('a');
    expect(map.canvas.getAttribute('aria-label')).toBe('Sites');
    render([9, 8]);
    await until(() => map.calls.some((c) => c[0] === 'flyTo'));
  });

  it('<LocationPicker> works in a form and reports its value', async () => {
    const { instance, container, root } = await world();
    const onChange = vi.fn();
    root.render(
      <TesseraProvider instance={instance}>
        <form>
          <LocationPicker name="venue" label="Where" onLocationChange={onChange} />
        </form>
      </TesseraProvider>,
    );
    await until(() => fake.maps.length > 0);
    fake.map().finishLoading();
    fake.map().fire('click', { lngLat: { lng: 8.5, lat: 47.4 } });
    await until(() => onChange.mock.calls.length > 0);
    expect(onChange.mock.calls[0]?.[0].detail.value).toMatchObject({ lng: 8.5, lat: 47.4 });
    const form = container.querySelector('form') as HTMLFormElement;
    expect(JSON.parse(String(new FormData(form).get('venue')))).toMatchObject({
      lng: 8.5,
      lat: 47.4,
    });
  });

  it('hooks give the maps API and the geocoder', async () => {
    const { instance, container, root } = await world();
    function Probe() {
      const api = useMapsApi();
      const geocoder = useGeocoder();
      return <output>{api && geocoder === api.geocoder() ? 'ready' : 'waiting'}</output>;
    }
    root.render(
      <TesseraProvider instance={instance}>
        <Probe />
      </TesseraProvider>,
    );
    await until(() => container.querySelector('output')?.textContent === 'ready');
  });
});
