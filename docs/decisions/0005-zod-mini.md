# 5. zod/mini for the kits' schemas

Status: accepted

## Context

`tessera` moved its runtime validation to `zod/mini` and runs the full config schema in development builds only (tessera ADR 5). The kits defined their option and document schemas with classic zod, which kept about 25 KB gzip of zod on every page that renders a kit.

## Decision

- Every schema in `packages/*/src` uses `zod/mini` (`import * as z from 'zod/mini'`). A Biome `noRestrictedImports` rule rejects classic `'zod'` there and in the playground.
- Option descriptions use `.check(z.describe('…'))`, so `scripts/gen-config-docs.mjs` keeps writing the same README tables. The kits require `zod@^4.2.0`, the first version whose zod/mini has `describe`.
- The validation itself is unchanged. Before the switch, every exported schema was compared with its classic version on 20,000 generated inputs: same accept/reject decision, same parsed output including defaults.

## Consequences

- Pages are 18–25 KB gzip smaller on first load (`docs/perf/after-0.2.md`).
- In production builds, an invalid option is reported as `features.<id>.<option>: Invalid input`: zod/mini carries no message catalog, and core only loads one with its development config schema. The path is still exact.
- The kits need `tessera` with zod/mini in core (the `TesseraPlugin.configSchema` type accepts zod/mini schemas from then on), so `deps.json` moves past `v0.1.0`.
