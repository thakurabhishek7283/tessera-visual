# Page cost baseline, October 2026

Measured on 2026-10-04 with `pnpm budget` (rolldown 1.2.12, minified ESM, code splitting on, gzip level 9, brotli quality 11), every dependency included except `react` and `react-dom`. Each page is the `tessera` base page (`createTessera` plus `@tessera-kit/elements/define`) plus one kit's `elements` entry. Budgets in `budgets/pages.json` start at these numbers plus 3% and only go down (see `tessera`'s ADR 6 and the update to [ADR 2](../decisions/0002-bundle-budgets.md)).

| Page | Initial gzip | Initial brotli | Total gzip | Budget (initial / total gzip) |
| --- | ---: | ---: | ---: | ---: |
| `annotator-page` | 67.7 KB | 59.1 KB | 105.9 KB | 69.8 / 109.1 KB |
| `maps-page` | 58.5 KB | 51.5 KB | 370.1 KB | 60.3 / 381.2 KB |

## Top contributors (initial load)

| Package | annotator | maps |
| --- | ---: | ---: |
| zod | 28.8 KB | 28.8 KB |
| @tessera-kit/elements | 16.6 KB | 16.6 KB |
| the kit itself | 12.0 KB | 4.0 KB |
| @tessera-kit/core | 4.2 KB | 3.8 KB |
| Lit (lit-html, reactive-element, lit-element, context) | 5.9 KB | 5.2 KB |

Lazy only: `maplibre-gl` 283.1 KB gzip on the maps page, loaded when a map renders (ADR 4); the annotator engine adds 22.3 KB gzip.

## What this says

- **zod is the largest package on both pages**, about 29 KB gzip and 43–49% of the initial load. Session 0.2 of the plan moves the runtime path to `zod/mini`.
- **MapLibre stays lazy**, as ADR 4 intends. The page budget's total figure now guards that: an eager import would move 283 KB into the initial load and fail the check.
- **No duplicate packages** on either page.
