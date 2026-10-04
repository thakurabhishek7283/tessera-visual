# Page cost after define-on-first-use (session 0.3)

Measured on 2026-10-04 with `pnpm budget` against tessera's `perf/lazy-define` branch (production builds). Previous: [after-0.2.md](after-0.2.md).

Neither kit loaded chunks eagerly, so this session adds entries (per-element and `autoload`) rather than removing downloads. The page-budget script (copied from tessera) now also counts chunks that a loaded chunk `import()`s as soon as it runs; nothing here does that, so the method change doesn't move these numbers. "Before" is `main`'s kit code measured with the same script and the same tessera.

| Page | Initial gzip before | Initial gzip after | Total gzip after | Budget, initial gzip |
| --- | ---: | ---: | ---: | ---: |
| `annotator-page` | 49.9 KB | 49.8 KB | 88.1 KB | 50.7 KB (unchanged) |
| `maps-page` | 34.1 KB | 34.1 KB | 353.1 KB | 34.5 KB (unchanged) |

Session 0.2 recorded annotator at 49.1 and maps at 33.4 KB. The difference (0.7 KB) is tessera's base page, which grew in session 0.3 (`lazyDefine` is part of every `TesseraElement`).

No budget moved. Measured plus 3% is above both current budgets (annotator: 51.3 KB > 50.7 KB), and neither had to go up.

## Own-code size limits (size-limit, gzip)

| Entry | Before | After | Limit |
| --- | ---: | ---: | ---: |
| annotator entry and plugin | 28.65 kB | 28.39 kB | 30 kB |
| annotator elements | 38.29 kB | 38.3 kB | 40 kB |
| maps entry and plugin | 16.65 kB | 16.65 kB | 20 kB |
| maps elements | 20.75 kB | 20.77 kB | 26 kB |
| annotator autoload | | 156 B | 0.3 kB (new) |
| maps autoload | | 110 B | 0.3 kB (new) |

The annotator "entry and plugin" figure drops because the build now splits code shared with the elements into different chunks, so less of it lands in the files that limit measures. The entry and plugin code didn't change.
