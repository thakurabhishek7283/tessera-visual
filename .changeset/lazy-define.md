---
"@tessera-kit/annotator": minor
"@tessera-kit/maps": minor
---

Pages can download code only for the elements they render.

- New `autoload` entry (`@tessera-kit/<kit>/autoload`): registers every tag of the kit with `lazyDefine` and nothing else (under 0.2 KB gzip). Each element downloads the first time it appears, in the document or in a shadow root.
- New per-element entries (`@tessera-kit/<kit>/elements/<tag>`), each defining one element and the ones it renders, for importing exactly what a page uses. The `elements` entry still defines every element.
- Element classes carry `static tesseraVersion`, so a page with two copies of a kit gets a development warning naming both versions.

Requires a `@tessera-kit/elements` with `lazyDefine`.
