# @tessera-kit/maps

## 0.2.0

### Minor Changes

- 144adae: First release: image annotation and a whiteboard (`@tessera-kit/annotator`), and maps with clustering and a form-associated location picker (`@tessera-kit/maps`).
- 97a1706: Pages can download code only for the elements they render.
  
  - New `autoload` entry (`@tessera-kit/<kit>/autoload`): registers every tag of the kit with `lazyDefine` and nothing else (under 0.2 KB gzip). Each element downloads the first time it appears, in the document or in a shadow root.
  - New per-element entries (`@tessera-kit/<kit>/elements/<tag>`), each defining one element and the ones it renders, for importing exactly what a page uses. The `elements` entry still defines every element.
  - Element classes carry `static tesseraVersion`, so a page with two copies of a kit gets a development warning naming both versions.
  
  Requires a `@tessera-kit/elements` with `lazyDefine`.
- 6415d8a: Option and document schemas use `zod/mini`, which takes 18–25 KB gzip off every page that renders the kit. Validation is unchanged. Exported schemas are now zod/mini schemas, so use the functional form for classic-only methods (`z.extend(schema, …)` instead of `schema.extend(…)`). Requires `zod@^4.2.0` and a `@tessera-kit/core` whose `configSchema` accepts zod/mini schemas.
