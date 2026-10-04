# Page cost after moving to zod/mini (session 0.2)

Measured on 2026-10-04 with `pnpm budget`, which now builds pages the way a production app does (`process.env.NODE_ENV` replaced with `"production"`), against `tessera` with core, protocol and storage on zod/mini. Baseline: [baseline-2026-10.md](baseline-2026-10.md). Decision: [ADR 5](../decisions/0005-zod-mini.md).

| Page | Initial gzip before | Initial gzip after | New budget (initial / total) |
| --- | ---: | ---: | ---: |
| `annotator-page` | 67.7 KB | **49.1 KB** | 50.7 / 90.1 KB |
| `maps-page` | 58.5 KB | **33.4 KB** | 34.5 / 362.9 KB |

zod was about 28 KB gzip on every page. It's now about 3 KB from core plus what the kit's own schemas use; those schemas load with the elements, so the zod/mini code they need (objects, defaults, enums, string and number checks) is part of the first load. Moving the option schemas behind the lazily loaded plugin is a possible next step.
