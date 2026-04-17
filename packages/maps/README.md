# @tessera/maps

A MapLibre map with clustered markers and popups, address search, and a form-associated location picker: a headless API, `<tessera-map>`, `<tessera-location-picker>` and React bindings. Part of [tessera-visual](../../README.md).

No API key is needed: the default style is [OpenFreeMap](https://openfreemap.org/) and the default geocoder is the public [Nominatim](https://nominatim.org/) server. MapLibre itself is loaded the first time a map opens, so a page that never shows one never downloads it.

## Quick start

### Any framework (Web Components)

```html
<script type="module">
  import '@tessera/maps/elements';
</script>

<tessera-map id="sites" fit-markers label="Campsites" style="--tessera-map-height: 28rem">
  <template slot="popup">
    <strong data-field="title"></strong> from $<span data-field="price"></span> a night
  </template>
</tessera-map>
<script type="module">
  document.querySelector('#sites').markers = [
    { id: 'lake', lng: 8.54, lat: 47.37, title: 'Lake site', color: 'success', data: { price: 24 } },
    { id: 'wood', lng: 8.6, lat: 47.42, title: 'Wood site', data: { price: 18 } },
  ];
</script>

<form>
  <tessera-location-picker name="venue" label="Where is it?" required></tessera-location-picker>
  <button>Save</button>
</form>
```

A bare element runs on Tessera's implicit default instance and turns the `maps` feature on with the defaults. The picker submits `venue` as JSON, `{"lng":8.54,"lat":47.37,"label":"Zürich, Switzerland"}`, and stops the form until a place is chosen.

### Bundlers: the web worker

MapLibre 6 starts its web worker from two files that sit next to its own module, and a bundler moves the module away from them. With Vite, add the plugin from this package and tell the feature where the files are:

```ts
// vite.config.ts
import { tesseraMapsWorker } from '@tessera/maps/vite';
export default defineConfig({ plugins: [tesseraMapsWorker()] });
```

```ts
features: { maps: { enabled: true, workerUrl: `${import.meta.env.BASE_URL}tessera-maps/maplibre-gl-worker.mjs` } }
```

The plugin serves `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` from `/tessera-maps/` in development and copies them into the build. With another bundler, copy those two files from `maplibre-gl/dist` into one folder of your site and point `workerUrl` at the worker file. (If you load MapLibre yourself, see `configureMapLibre`.)

### With `createTessera`

```ts
import { createTessera } from '@tessera/core';

const tessera = createTessera(
  {
    appId: 'camp',
    features: {
      maps: {
        enabled: true,
        styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
        darkStyleUrl: 'https://example.com/styles/dark.json', // optional: used when the theme is dark
        geocoder: { type: 'nominatim', url: 'https://nominatim.openstreetmap.org', email: 'you@example.com' },
      },
    },
  },
  { plugins: { maps: () => import('@tessera/maps') } },
);
await tessera.ready;

const maps = tessera.feature('maps');
const map = await maps?.create(document.querySelector('#map')!, { center: [8.54, 47.37], zoom: 11 });
map?.setMarkers([{ id: 'a', lng: 8.54, lat: 47.37, title: 'Zürich' }]);
map?.on('marker-click', ({ marker }) => map.openPopup(marker.id, marker.title ?? marker.id));
const hits = await maps?.geocoder().search('Seestrasse Zürich');
```

### React

```tsx
import { LocationPicker, MapView, useGeocoder } from '@tessera/maps/react';

export function Sites({ sites }: { sites: Array<{ id: string; lng: number; lat: number; title: string }> }) {
  return (
    <>
      <MapView markers={sites} fitMarkers label="Campsites" onMarkerClick={(e) => console.log(e.detail.marker)} />
      <form>
        <LocationPicker name="venue" required onLocationChange={(e) => console.log(e.detail.value)} />
      </form>
    </>
  );
}
```

On the server the wrappers render an empty tag that upgrades after hydration. In Next.js, import them with `dynamic(() => import(...), { ssr: false })` if you want to avoid the empty tag in the HTML.

## Configuration

<!-- config:start -->

| Option | Type | Default | Description |
|---|---|---|---|
| `styleUrl` | `string` | `"https://tiles.openfreemap.org/styles/liberty"` | MapLibre style document. The default is OpenFreeMap and needs no API key. |
| `darkStyleUrl` | `string` | – | Style used when the theme resolves to dark. Defaults to `styleUrl`. |
| `center` | `[number, number]` | `[0,20]` | Initial centre as `[lng, lat]`. |
| `zoom` | `number` | `1.5` | Initial zoom level. |
| `cluster` | `object` | `{"enabled":true,"radius":50,"maxZoom":14}` | Cluster nearby markers until `maxZoom`. |
| `cluster.radius` | `number` | `50` |  |
| `cluster.maxZoom` | `number` | `14` |  |
| `geocoder` | `{ type: "nominatim", … } \| { type: "maptiler", … } \| { type: "none", … }` | `{"type":"nominatim","url":"https://nominatim.openstreetma…` | Address search. The public Nominatim server is for light use; run your own for production. |
| `controls` | `object` | `{"navigation":true,"geolocate":true,"fullscreen":false,"s…` | Map controls to show. |
| `controls.navigation` | `boolean` | `true` |  |
| `controls.geolocate` | `boolean` | `true` |  |
| `controls.fullscreen` | `boolean` | `false` |  |
| `controls.scale` | `boolean` | `false` |  |
| `workerUrl` | `string` | – | URL of maplibre-gl-worker.mjs. Needed when your bundler moves MapLibre away from its worker file (Vite: import it with `?url`). |
| `attribution` | `true` | `true` | Always on: the tile and data licences require it. |

<!-- config:end -->

## Elements

### `<tessera-map>`

| Attribute / property | Description |
| --- | --- |
| `markers` (property) | `MapMarker[]`: `{ id, lng, lat, title?, color?, data? }`. `color` is `primary`, `danger`, `warning`, `success` or any CSS colour. |
| `center`, `zoom` | Initial view; `center` as an attribute is `"lng,lat"`. Changing them later moves the map. |
| `selected` | Id of the highlighted marker. |
| `fit-markers` | Zoom to show every marker whenever they change. |
| `renderPopup` (property) | `(marker) => HTMLElement \| string \| null`, to build a popup yourself. |
| `label` | Accessible name of the map. |
| `handle` (property, read only) | The `MapHandle` once the map is open. |

| Event | Detail | Cancelable |
| --- | --- | --- |
| `marker-click` | `{ marker }` | no |
| `bounds-change` | `{ bounds }`, once the map stops moving | no |
| `map-click` | `{ lng, lat }`, empty map only | no |

Slot `popup`: a `<template>`. On a marker click it is cloned and every element with `data-field="name"` gets the text of `marker.data.name` (or `title` / `id`). Text only, never markup. Part: `map`. Height: `--tessera-map-height` (default `24rem`).

### `<tessera-location-picker>`

Search for an address or click the map; drag the pin to adjust. Form-associated: it submits `name` with the value as JSON, supports `required` and `disabled`, and resets with the form.

| Attribute / property | Description |
| --- | --- |
| `name` | Name the value is submitted under. |
| `label` | Visible label. |
| `required`, `disabled` | As on any form control. |
| `center`, `zoom` | Initial view of the map. |
| `value` (property) | `{ lng, lat, label } \| null`. |

| Event | Detail |
| --- | --- |
| `location-change` | `{ value }`, `null` when cleared |

The search field is a combobox: type at least two letters, wait a moment (400 ms), then choose with the arrow keys and `Enter` or a click. Choosing a place on the map first takes its coordinates, then replaces them with the address the geocoder finds. Parts: `search`, `results`, `map`.

## The handle

`maps.create(el, overrides)` resolves to a `MapHandle`:

| Member | Description |
| --- | --- |
| `setMarkers(markers)` | Replaces the markers. They are one GeoJSON source drawn by circle layers (clustered by `cluster`), so thousands stay fast. Markers with an impossible position are dropped. |
| `fitToMarkers(padding?)` · `flyTo(lng, lat, zoom?)` · `resize()` | The view. |
| `setSelected(id \| null)` | Highlights a marker through feature state. |
| `setPin({ lng, lat } \| null, { draggable?, label?, color? })` | One extra pin, e.g. a chosen place. |
| `bounds` | Store of the visible area, updated 250 ms after the map stops. |
| `on(event, fn)` | `marker-click`, `cluster-click`, `move-end`, `click`, `pin-move`. |
| `openPopup(markerId, content)` · `closePopup()` | A string is shown as text, never as markup. |
| `setLabel(label)` | Accessible name of the map. |
| `raw()` | The MapLibre `Map`, as an escape hatch. |
| `destroy()` | Removes the map. |

`maps.geocoder()` is one shared geocoder: `search(query, { limit?, signal?, bias? })` and `reverse(lng, lat)`. Nominatim requests are queued at one per second and the 100 most recent answers are cached, as its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) asks; set `geocoder.email` to identify your app and run your own instance for production. `{ type: 'maptiler', apiKey }` uses MapTiler's geocoding API and `{ type: 'none' }` turns search off.

## Theme, language, attribution

The map uses `darkStyleUrl` when the Tessera theme is dark and switches when the theme changes. Marker and cluster colours are read from the theme tokens, so they follow it too. Attribution is always shown (`attribution` cannot be turned off): the tile and data licences require it. English and German strings ship with the package (`map.*`, `picker.*`); override any key through `config.messages`.

MapLibre's stylesheet is added once to the document or shadow root the map lives in, so no CSS import is needed.

## Accessibility

The map canvas has one name (set it with `label`) and MapLibre's own keyboard handling (arrows pan, `+` `-` zoom). A status line states how many places are shown. The picker is a labelled combobox with a result count announced in a live region, and its result is readable text next to the pin, so nothing depends on the pointer.

## Limits

`fitToMarkers` does not treat the antimeridian specially. Tiles and the default geocoder need the network; the default style and Nominatim are shared public services. Markers are circles, not custom icons.
