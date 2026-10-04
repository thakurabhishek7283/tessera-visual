import * as z from 'zod/mini';

const Lngl = z.tuple([
  z.number().check(z.gte(-180), z.lte(180)),
  z.number().check(z.gte(-90), z.lte(90)),
]);

/** Options of the `maps` feature. `{ enabled: true }` alone is valid. */
export const MapsConfig = z.object({
  enabled: z.boolean(),
  styleUrl: z
    ._default(z.string(), 'https://tiles.openfreemap.org/styles/liberty')
    .check(z.describe('MapLibre style document. The default is OpenFreeMap and needs no API key.')),
  darkStyleUrl: z
    .optional(z.string())
    .check(z.describe('Style used when the theme resolves to dark. Defaults to `styleUrl`.')),
  center: z._default(Lngl, [0, 20]).check(z.describe('Initial centre as `[lng, lat]`.')),
  zoom: z
    ._default(z.number().check(z.gte(0), z.lte(22)), 1.5)
    .check(z.describe('Initial zoom level.')),
  cluster: z
    ._default(
      z.object({
        enabled: z._default(z.boolean(), true),
        radius: z._default(z.number().check(z.gte(1), z.lte(200)), 50),
        maxZoom: z._default(z.number().check(z.gte(0), z.lte(22)), 14),
      }),
      { enabled: true, radius: 50, maxZoom: 14 },
    )
    .check(z.describe('Cluster nearby markers until `maxZoom`.')),
  geocoder: z
    ._default(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('nominatim'),
          url: z._default(z.string(), 'https://nominatim.openstreetmap.org'),
          email: z
            .optional(z.string())
            .check(z.describe('Contact address sent with requests, as the usage policy asks.')),
        }),
        z.object({ type: z.literal('maptiler'), apiKey: z.string() }),
        z.object({ type: z.literal('none') }),
      ]),
      { type: 'nominatim', url: 'https://nominatim.openstreetmap.org' },
    )
    .check(
      z.describe(
        'Address search. The public Nominatim server is for light use; run your own for production.',
      ),
    ),
  controls: z
    ._default(
      z.object({
        navigation: z._default(z.boolean(), true),
        geolocate: z._default(z.boolean(), true),
        fullscreen: z._default(z.boolean(), false),
        scale: z._default(z.boolean(), false),
      }),
      { navigation: true, geolocate: true, fullscreen: false, scale: false },
    )
    .check(z.describe('Map controls to show.')),
  workerUrl: z
    .optional(z.string())
    .check(
      z.describe(
        'URL of maplibre-gl-worker.mjs. Needed when your bundler moves MapLibre away from its worker file (Vite: import it with `?url`).',
      ),
    ),
  attribution: z
    ._default(z.literal(true), true)
    .check(z.describe('Always on: the tile and data licences require it.')),
});

export type MapsConfigValue = z.infer<typeof MapsConfig>;
