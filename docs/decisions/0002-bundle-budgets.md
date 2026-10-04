# 2. Bundle budgets are measured on everything an entry can load

Status: accepted

## Context

The size budgets are checked with `size-limit`, which bundles an entry together with the modules it imports dynamically. The `elements` entry of a kit loads its plugin lazily (`registerImplicitPlugin`), and `@tessera-kit/maps` loads MapLibre and its stylesheet lazily, so the number `size-limit` reports is the cost of the kit when all of it is used, not of the first request.

## Decision

Budgets (min + gzip, peers and MapLibre itself excluded) are set on that total, from what the code costs today plus a small margin:

| Package | Entry and plugin | Elements, everything they can load |
| --- | --- | --- |
| `@tessera-kit/annotator` | 30 kB (the plan's budget for the whole package) | 40 kB |
| `@tessera-kit/maps` | 20 kB | 26 kB |

Entry and plugin is the headless engine for the annotator (shapes, history, tools, spatial index, persistence, W3C and PNG export; 28 kB) and the API, geocoder and map logic for maps. For maps the 20 kB includes MapLibre's stylesheet (about 10 kB gzipped), which is its own lazy chunk; without it the plugin is about 7 kB, under the plan's 10 kB. The elements entries add the Lit elements, the toolbar, the list and the label picker (annotator, about 9 kB) or the map and picker elements (maps, about 4 kB).

## Consequences

- The annotator is above the 30 kB the plan gave the whole package, because the plan's figure left out the UI. Everything the UI needs is separate from the engine: a host that only wants the headless API pays the first column.
- MapLibre (about 270 kB gzipped) is never in a budget: it is a dependency fetched when the first map opens.
- A budget failure in CI means a real regression of what users download, not an accounting quirk. Raising a limit needs a note here.

## Update, October 2026: page budgets

The size-limit budgets above ignore peers, so they can't show what a page downloads. `pnpm budget` (`scripts/page-budget.mjs`, copied from `tessera`, see its ADR 6) now also measures realistic pages from `budgets/pages/*.ts` with every dependency included, reports the top packages and any duplicate copies, and fails CI above `budgets/pages.json`. Both kinds of budget run in CI; the baseline is in `docs/perf/baseline-2026-10.md`.
