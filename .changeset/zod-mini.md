---
"@tessera-kit/annotator": minor
"@tessera-kit/maps": minor
---

Option and document schemas use `zod/mini`, which takes 18–25 KB gzip off every page that renders the kit. Validation is unchanged. Exported schemas are now zod/mini schemas, so use the functional form for classic-only methods (`z.extend(schema, …)` instead of `schema.extend(…)`). Requires `zod@^4.2.0` and a `@tessera-kit/core` whose `configSchema` accepts zod/mini schemas.
