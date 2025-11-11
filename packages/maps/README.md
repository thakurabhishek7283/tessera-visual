# @tessera/maps

Work in progress.

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
| `attribution` | `true` | `true` | Always on: the tile and data licences require it. |

<!-- config:end -->
