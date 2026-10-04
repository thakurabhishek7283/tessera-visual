# 4. MapLibre loads lazily, its stylesheet is generated, and its worker needs a URL

Status: accepted

## Context

MapLibre GL JS is large, needs a stylesheet inside whatever DOM scope the map lives in (a shadow root for our elements), and in version 6 starts its web worker from two files (`maplibre-gl-worker.mjs`, which imports `maplibre-gl-shared.mjs`) that must sit next to each other. A bundler moves the library away from them, and the worker then fails to load with the single message "Worker failed to load".

## Decision

- `createMap` loads `maplibre-gl` and a generated stylesheet module with dynamic `import()`s, so a page that never opens a map downloads neither. `configureMapLibre()` replaces the loader (a self-hosted build, an eager import, or the test double).
- The stylesheet is generated into `src/maplibre-css.generated.ts` by `scripts/sync-maplibre-css.mjs` from the installed `maplibre-gl` (committed, like the core's tokens; CI checks it is current) and adopted once into the document or shadow root of each map.
- The feature option `workerUrl` sets MapLibre's worker URL. `@tessera-kit/maps/vite` exports `tesseraMapsWorker()`, a Vite plugin that serves both worker files in development and copies them into the build; the playground uses it and the README documents the manual alternative.
- Tests run the real MapLibre (WebGL in Chromium) against an inline style with no tiles, in addition to a test double that covers the logic in detail. The end-to-end tests answer the style request themselves. The one test that needs real tiles is tagged `@network` and is skipped unless `NETWORK_E2E=1`.

## Consequences

- Marker layers, clustering, feature state, popups and style switching are checked against the library they run on, offline. This found, among other things, the worker problem above, which only shows in a production build.
- Hosts that bundle MapLibre need to know about `workerUrl`; the error is silent otherwise, so the README states it where the setup is explained.
- A MapLibre upgrade means running `pnpm --filter @tessera-kit/maps sync-css` and committing the result.
