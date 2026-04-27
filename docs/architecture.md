# Architecture

This page is for people changing the code. The user-facing view is in the [package READMEs](../packages) and the [playground](https://thakurabhishek7283.github.io/tessera-visual/). The core packages this repository builds on are described in the [`tessera` architecture notes](https://github.com/thakurabhishek7283/tessera/blob/main/docs/architecture.md).

## Packages

```text
   @tessera/core   @tessera/elements   @tessera/storage   (@tessera/transport, optional)
        ▲                  ▲                   ▲
        │                  │                   │
        └──────── annotator ·  maps ───────────┘      kits never import each other

 private, bundled into the kits:
   @tessera-internal/react-wrap   SSR-safe React wrappers for custom elements
   @tessera-internal/test-utils   fixtures, axe helper, instance mounting (tests only)
```

When one kit improves another it asks the instance's service registry and works without the answer. The annotator shows a `<tessera-comments>` thread for the selected shape when the `comments` service and element exist, and a note field otherwise.

## One kit, four layers

1. **Schemas and config** (`config.ts`, `geometry/model.ts`): zod definitions of the feature options and of the stored documents. The config schema is the single source for the README tables (`scripts/gen-config-docs.mjs`) and for the playground's config form.
2. **Headless logic**: for the annotator the engine (`engine/`), the tools (`tools/`), persistence and interop; for maps the geocoder, GeoJSON conversion and the MapLibre integration. No element code.
3. **Plugin and API** (`plugin.ts`, `api.ts`, `surface.ts`): `definePlugin` registers the feature, validates the options and exposes `create(el, options)`, which mounts a surface into any element and returns a handle.
4. **Elements and React** (`elements/`, `react/`): Lit elements built on `TesseraElement`, and `wrapElement` wrappers with hooks.

## Annotator

```text
 pointer / key ─▶ input.ts ─▶ NormalizedPointer ─▶ ToolManager ─▶ Tool (select, rect, …)
                                                        │               │ preview / drafts
                                                        ▼               ▼
                                              AnnotatorEngine ◀── commit (host veto, label flow)
        ┌───────────────┬───────────────┬──────────────┬──────────────┐
   AnnotationStore   SpatialIndex     Viewport      Selection      History (core)
   (delta commands)  (rbush + boxes)  (scale, tx, ty)
        │
        ├──▶ Renderer ──▶ <svg><g transform> shapes </g><g> overlay (screen space) </g></svg>
        └──▶ SetPersistence ──▶ storage collection `annotator.sets` (merge + tombstones)
```

- `AnnotationStore.list` is an immutable array in stacking order. Every mutation builds `Change`s (`from`, `to`, `index`) and pushes one command to the history, so undo and redo touch only what that step changed.
- `engine.drafts` (geometry overrides while dragging), `engine.preview` (the shape being drawn), `engine.marquee`, `engine.erasing` and `engine.snapIndicator` are small stores the renderer observes; tools write to them and clear them on release or cancel.
- `engine.create()` is the single path from a finished gesture to a stored annotation: host veto (`beforeCreate`), label prompt (`pickLabel`, when `requireLabel`), then `store.add` and selection.
- The renderer batches updates into one animation frame and reconciles shape nodes by id; a pan or zoom only sets the `transform` of the world group.
- Persistence listens to the engine's `changed` events (not to remote loads), keeps tombstones for deletions, saves with a version check and merges on conflict; see ADR 0003.

## Maps

```text
 <tessera-map> ─▶ MapSession ─▶ maps.create(el) ─▶ createMap ─▶ MapLibre (lazy) + stylesheet (lazy, adopted per root)
 <tessera-location-picker> ─┘                          │
                                                       ├─ one GeoJSON source `tessera-markers` (clustered)
                                                       │    layers: clusters · counts · points (feature-state: selected)
                                                       ├─ popups, one draggable pin, controls, theme style switching
                                                       └─ Geocoder (one per feature: queue 1 req/s, LRU 100)
```

`MapSession` (in `elements/`) owns the open/close life cycle of an element's map the same way for both elements: generation counters make a slow `create` harmless when the element changed meanwhile, and a failure is remembered so a map that cannot load is not retried in a render loop. The location picker is a form-associated custom element: it keeps its value in `ElementInternals`, reports validity (`required`) and resets with the form.

## Testing

| Layer | Where | What |
| --- | --- | --- |
| Unit (node) | `test/*.test.ts` | geometry, hit tests, snapping, store and undo, viewport, every tool by scripted gestures, W3C round trips, persistence merge, geocoder and rate limiter, i18n |
| Component (Chromium) | `test/*.browser.test.ts` | renderer, input, PNG export, elements with axe, React bindings, maps with a test double, maps against the real MapLibre |
| End to end (Playwright) | `e2e/` | the built playground: draw, reload, two tabs, W3C panel, whiteboard, maps (offline style), picker in a form |

Tests are deterministic: clocks and id generators are injected through the context, the maps tests answer the style request themselves, and nothing needs the network except the single test tagged `@network`.
