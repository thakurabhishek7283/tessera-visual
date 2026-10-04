import '@tessera-kit/elements/define';
import '../src/elements/index.js';
import {
  cleanup,
  expectAccessible,
  mountInstance,
  must,
  settle,
  until,
} from '@tessera-internal/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TesseraLocationPicker, TesseraMapElement } from '../src/elements/index.js';
import { configureMapLibre } from '../src/maplibre.js';
import { createFakeMapLibre, type Fake } from './fake-maplibre.js';

let fake: Fake;
const realFetch = globalThis.fetch;

beforeEach(() => {
  fake = createFakeMapLibre();
  configureMapLibre(async () => fake.loaded);
});

afterEach(() => {
  cleanup();
  configureMapLibre(undefined);
  globalThis.fetch = realFetch;
});

async function mount<T extends Element>(markup: string, features: Record<string, unknown> = {}) {
  const { root, instance } = await mountInstance(
    {
      features: {
        maps: { enabled: true, geocoder: { type: 'maptiler', apiKey: 'test' }, ...features },
      },
    },
    { maps: () => import('../src/plugin.js') },
  );
  root.innerHTML = markup;
  const el = must(root.firstElementChild as unknown as T);
  await settle(el);
  return { root, instance, el };
}

const mounted = async <T extends Element>(el: T): Promise<void> => {
  await until(() => fake.maps.length > 0);
  await settle(el);
};

function fakeGeocoding(): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.includes('limit=1')
        ? { features: [{ place_name: 'Bahnhofstrasse 1, Zürich', center: [8.54, 47.37] }] }
        : {
            features: [
              {
                place_name: 'Zürich, Switzerland',
                center: [8.54, 47.37],
                bbox: [8.45, 47.32, 8.63, 47.43],
              },
              { place_name: 'Zurich, Illinois, United States', center: [-88.1, 42.2] },
            ],
          },
  }));
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

describe('<tessera-map>', () => {
  it('opens a map in its container and is accessible', async () => {
    const { el } = await mount<TesseraMapElement>('<tessera-map label="Campsites"></tessera-map>');
    await mounted(el);
    expect(fake.maps).toHaveLength(1);
    expect(fake.map().canvas.getAttribute('aria-label')).toBe('Campsites');
    await expectAccessible(el);
  });

  it('shows markers it is given, as they change, and says how many in words', async () => {
    const { el } = await mount<TesseraMapElement>('<tessera-map></tessera-map>');
    await mounted(el);
    fake.map().finishLoading();
    el.markers = [
      { id: 'a', lng: 1, lat: 1 },
      { id: 'b', lng: 2, lat: 2 },
    ];
    await settle(el);
    const data = fake.map().sources.get('tessera-markers')?.data as { features: unknown[] };
    expect(data.features).toHaveLength(2);
    expect(el.shadowRoot?.querySelector('[role=status]')?.textContent).toContain('2 places');
    el.markers = [{ id: 'a', lng: 1, lat: 1 }];
    await settle(el);
    expect(el.shadowRoot?.querySelector('[role=status]')?.textContent).toContain('1 place');
  });

  it('fits to the markers when asked, highlights the selected one, and reads the centre attribute', async () => {
    const { el } = await mount<TesseraMapElement>(
      '<tessera-map fit-markers center="8.5,47.4" zoom="9" selected="b"></tessera-map>',
    );
    el.markers = [
      { id: 'a', lng: 1, lat: 2 },
      { id: 'b', lng: 5, lat: 6 },
    ];
    await mounted(el);
    const map = fake.map();
    expect(map.options).toMatchObject({ center: [8.5, 47.4], zoom: 9 });
    map.finishLoading();
    await vi.waitFor(() => expect(map.calls.find((c) => c[0] === 'fitBounds')).toBeDefined());
    expect([...map.featureState.keys()]).toEqual(['b']);
  });

  it('turns clicks into events and shows a popup from a template, filled with text only', async () => {
    const { el } = await mount<TesseraMapElement>(`<tessera-map>
      <template slot="popup"><strong data-field="title"></strong><span data-field="price"></span></template>
    </tessera-map>`);
    await mounted(el);
    el.markers = [{ id: 'a', lng: 1, lat: 1, title: '<b>Lake</b> site', data: { price: 24 } }];
    await settle(el);
    const map = fake.map();
    map.finishLoading();
    const clicked: unknown[] = [];
    el.addEventListener('marker-click', (e) => clicked.push((e as CustomEvent).detail.marker.id));
    map.fire(
      'click',
      { features: [{ properties: { id: 'a' } }], lngLat: { lng: 1, lat: 1 } },
      'tessera-points',
    );
    expect(clicked).toEqual(['a']);
    const popup = fake.popups[0];
    expect(popup?.content?.textContent).toBe('<b>Lake</b> site24');
    expect(
      popup?.content instanceof HTMLElement ? popup.content.querySelector('b') : null,
    ).toBeNull();
  });

  it('lets renderPopup build the popup and wins over the template', async () => {
    const { el } = await mount<TesseraMapElement>(
      '<tessera-map><template slot="popup"><i data-field="title"></i></template></tessera-map>',
    );
    el.renderPopup = (m) => `custom ${m.id}`;
    el.markers = [{ id: 'a', lng: 1, lat: 1, title: 'x' }];
    await mounted(el);
    await settle(el);
    fake.map().finishLoading();
    fake
      .map()
      .fire(
        'click',
        { features: [{ properties: { id: 'a' } }], lngLat: { lng: 1, lat: 1 } },
        'tessera-points',
      );
    expect(fake.popups[0]?.content?.textContent).toBe('custom a');
  });

  it('reports map clicks and bounds changes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { el } = await mount<TesseraMapElement>('<tessera-map></tessera-map>');
      await until(() => fake.maps.length > 0);
      const map = fake.map();
      const events: string[] = [];
      el.addEventListener('map-click', (e) =>
        events.push(`click ${JSON.stringify((e as CustomEvent).detail)}`),
      );
      el.addEventListener('bounds-change', (e) =>
        events.push(`bounds ${JSON.stringify((e as CustomEvent).detail.bounds)}`),
      );
      map.finishLoading();
      map.fire('click', { lngLat: { lng: 3, lat: 4 } });
      await vi.advanceTimersByTimeAsync(300);
      expect(events).toEqual(['click {"lng":3,"lat":4}', 'bounds [[-1,19],[1,21]]']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves the map when centre or zoom change later', async () => {
    const { el } = await mount<TesseraMapElement>(
      '<tessera-map center="1,2" zoom="5"></tessera-map>',
    );
    await mounted(el);
    el.center = [8, 47];
    el.zoom = 11;
    await settle(el);
    expect(fake.map().calls.find((c) => c[0] === 'flyTo')?.[1]).toEqual({
      center: [8, 47],
      zoom: 11,
    });
  });

  it('shows an error when the map library cannot load, and hides when the feature is off', async () => {
    configureMapLibre(async () => {
      throw new Error('offline');
    });
    const { el, instance } = await mount<TesseraMapElement>('<tessera-map></tessera-map>');
    const alert = await until(() => el.shadowRoot?.querySelector('[role=alert]'));
    expect(alert.textContent).toContain('could not be loaded');
    await instance.disable('maps');
    await until(() => el.hasAttribute('hidden'));
  });

  it('closes its map when removed', async () => {
    const { el } = await mount<TesseraMapElement>('<tessera-map></tessera-map>');
    await mounted(el);
    const map = fake.map();
    el.remove();
    expect(map.removed).toBe(true);
  });

  it('is available in German', async () => {
    const { el, instance } = await mount<TesseraMapElement>('<tessera-map></tessera-map>');
    instance.setLocale('de');
    await mounted(el);
    await until(() => fake.map().canvas.getAttribute('aria-label') === 'Karte');
  });
});

describe('<tessera-location-picker>', () => {
  const form = async (inner = '', features: Record<string, unknown> = {}) => {
    const ctx = await mount<HTMLFormElement>(
      `<form><tessera-location-picker name="venue" ${inner}></tessera-location-picker></form>`,
      features,
    );
    const picker = must(ctx.el.querySelector<TesseraLocationPicker>('tessera-location-picker'));
    await settle(picker);
    await until(() => fake.maps.length > 0);
    fake.map().finishLoading();
    return { ...ctx, picker, form: ctx.el };
  };

  it('is a combobox with a labelled map, a hint and no accessibility violations', async () => {
    const { picker } = await form();
    const input = must(picker.shadowRoot?.querySelector<HTMLInputElement>('input'));
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(picker.shadowRoot?.textContent).toContain('No location chosen');
    await expectAccessible(picker);
  });

  it('chooses a place by clicking the map: pin, form value, event and the address from the geocoder', async () => {
    fakeGeocoding();
    const { picker, form: f } = await form();
    const changes: unknown[] = [];
    picker.addEventListener('location-change', (e) =>
      changes.push((e as CustomEvent).detail.value.label),
    );
    fake.map().fire('click', { lngLat: { lng: 8.54, lat: 47.37 } });
    await until(() => (picker.value?.label ?? '').startsWith('Bahnhofstrasse'));
    expect(picker.value).toEqual({ lng: 8.54, lat: 47.37, label: 'Bahnhofstrasse 1, Zürich' });
    expect(changes[0]).toBe('47.37000, 8.54000');
    expect(changes.at(-1)).toBe('Bahnhofstrasse 1, Zürich');
    expect(JSON.parse(String(new FormData(f).get('venue')))).toEqual({
      lng: 8.54,
      lat: 47.37,
      label: 'Bahnhofstrasse 1, Zürich',
    });
    expect(fake.markers[0]?.options).toMatchObject({ draggable: true });
    await settle(picker);
    expect(picker.shadowRoot?.textContent).toContain('Bahnhofstrasse 1, Zürich');
    await expectAccessible(picker);
  });

  it('follows a dragged pin', async () => {
    fakeGeocoding();
    const { picker } = await form();
    fake.map().fire('click', { lngLat: { lng: 8.54, lat: 47.37 } });
    await until(() => fake.markers.length > 0);
    fake.markers.at(-1)?.drop(9, 48);
    await until(() => picker.value?.lng === 9);
    expect(picker.value).toMatchObject({ lng: 9, lat: 48 });
  });

  it('searches as you type, with a pause, and chooses with the keyboard', async () => {
    const spy = fakeGeocoding();
    const { picker, form: f } = await form();
    const input = must(picker.shadowRoot?.querySelector<HTMLInputElement>('input'));
    input.value = 'Zürich';
    input.dispatchEvent(new Event('input'));
    expect(spy).not.toHaveBeenCalled();
    const list = await until(() => picker.shadowRoot?.querySelector('[role=listbox]'));
    expect(spy).toHaveBeenCalledOnce();
    await settle(picker);
    const options = [...list.querySelectorAll('[role=option]')];
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      'Zürich, Switzerland',
      'Zurich, Illinois, United States',
    ]);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    await expectAccessible(picker);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    await settle(picker);
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]?.id);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await settle(picker);
    expect(picker.value).toEqual({ lng: 8.54, lat: 47.37, label: 'Zürich, Switzerland' });
    expect(picker.shadowRoot?.querySelector('[role=listbox]')).toBeNull();
    expect(fake.map().calls.some((c) => c[0] === 'flyTo')).toBe(true);
    expect(String(new FormData(f).get('venue'))).toContain('Zürich, Switzerland');
  });

  it('chooses by clicking a result, and closes the list with Escape', async () => {
    fakeGeocoding();
    const { picker } = await form();
    const input = must(picker.shadowRoot?.querySelector<HTMLInputElement>('input'));
    input.value = 'Zurich';
    input.dispatchEvent(new Event('input'));
    const list = await until(() => picker.shadowRoot?.querySelector('[role=listbox]'));
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await settle(picker);
    expect(picker.shadowRoot?.querySelector('[role=listbox]')).toBeNull();
    input.value = 'Zurich ';
    input.dispatchEvent(new Event('input'));
    const again = await until(() => picker.shadowRoot?.querySelector('[role=listbox]'));
    must(again.querySelectorAll<HTMLElement>('[role=option]')[1]).click();
    expect(picker.value?.label).toBe('Zurich, Illinois, United States');
    void list;
  });

  it('says so when there is nothing or the search fails, and does not break', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ features: [] }),
    })) as unknown as typeof fetch;
    const { picker } = await form();
    const input = must(picker.shadowRoot?.querySelector<HTMLInputElement>('input'));
    input.value = 'Nowhereville';
    input.dispatchEvent(new Event('input'));
    await until(() => picker.shadowRoot?.textContent?.includes('No results'));
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    input.value = 'Somewhere else';
    input.dispatchEvent(new Event('input'));
    await until(() => picker.shadowRoot?.textContent?.includes('not available'));
  });

  it('supports required, validity, reset and clearing inside a form', async () => {
    fakeGeocoding();
    const { picker, form: f } = await form('required');
    expect(f.checkValidity()).toBe(false);
    fake.map().fire('click', { lngLat: { lng: 1, lat: 2 } });
    await until(() => picker.value !== null);
    expect(f.checkValidity()).toBe(true);
    f.reset();
    await settle(picker);
    expect(picker.value).toBeNull();
    expect(f.checkValidity()).toBe(false);
    fake.map().fire('click', { lngLat: { lng: 1, lat: 2 } });
    await until(() => picker.value !== null);
    await settle(picker);
    const clear = must(picker.shadowRoot?.querySelector<HTMLButtonElement>('button.clear'));
    clear.click();
    expect(picker.value).toBeNull();
    expect(new FormData(f).get('venue')).toBeNull();
  });

  it('ignores the map when disabled', async () => {
    fakeGeocoding();
    const { picker } = await form('disabled');
    fake.map().fire('click', { lngLat: { lng: 1, lat: 2 } });
    await new Promise((r) => setTimeout(r, 30));
    expect(picker.value).toBeNull();
  });

  it('shows a value it is given, with its pin', async () => {
    fakeGeocoding();
    const { picker } = await form();
    picker.value = { lng: 8.5, lat: 47.4, label: 'Given place' };
    await settle(picker);
    expect(picker.shadowRoot?.textContent).toContain('Given place');
    expect(fake.markers.at(-1)?.lngLat).toEqual({ lng: 8.5, lat: 47.4 });
  });
});

describe('without any setup', () => {
  it('a bare <tessera-map> switches the feature on in the implicit instance and opens a map', async () => {
    const { resetDefaultInstance } = await import('@tessera-kit/elements');
    resetDefaultInstance();
    const host = document.createElement('div');
    document.body.append(host);
    host.innerHTML = '<tessera-map></tessera-map>';
    const el = must(host.firstElementChild as TesseraMapElement);
    await until(() => fake.maps.length > 0, 8000);
    await settle(el);
    expect(el.handle).toBeDefined();
    resetDefaultInstance();
  });
});
