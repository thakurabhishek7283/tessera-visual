import { z } from 'zod';

const Lngl = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** Options of the `maps` feature. `{ enabled: true }` alone is valid. */
export const MapsConfig = z.object({
  enabled: z.boolean(),
  styleUrl: z
    .string()
    .default('https://tiles.openfreemap.org/styles/liberty')
    .describe('MapLibre style document. The default is OpenFreeMap and needs no API key.'),
  darkStyleUrl: z
    .string()
    .optional()
    .describe('Style used when the theme resolves to dark. Defaults to `styleUrl`.'),
  center: Lngl.default([0, 20]).describe('Initial centre as `[lng, lat]`.'),
  zoom: z.number().min(0).max(22).default(1.5).describe('Initial zoom level.'),
  cluster: z
    .object({
      enabled: z.boolean().default(true),
      radius: z.number().min(1).max(200).default(50),
      maxZoom: z.number().min(0).max(22).default(14),
    })
    .default({ enabled: true, radius: 50, maxZoom: 14 })
    .describe('Cluster nearby markers until `maxZoom`.'),
  geocoder: z
    .discriminatedUnion('type', [
      z.object({
        type: z.literal('nominatim'),
        url: z.string().default('https://nominatim.openstreetmap.org'),
        email: z
          .string()
          .optional()
          .describe('Contact address sent with requests, as the usage policy asks.'),
      }),
      z.object({ type: z.literal('maptiler'), apiKey: z.string() }),
      z.object({ type: z.literal('none') }),
    ])
    .default({ type: 'nominatim', url: 'https://nominatim.openstreetmap.org' })
    .describe(
      'Address search. The public Nominatim server is for light use; run your own for production.',
    ),
  controls: z
    .object({
      navigation: z.boolean().default(true),
      geolocate: z.boolean().default(true),
      fullscreen: z.boolean().default(false),
      scale: z.boolean().default(false),
    })
    .default({ navigation: true, geolocate: true, fullscreen: false, scale: false })
    .describe('Map controls to show.'),
  attribution: z
    .literal(true)
    .default(true)
    .describe('Always on: the tile and data licences require it.'),
});

export type MapsConfigValue = z.infer<typeof MapsConfig>;
