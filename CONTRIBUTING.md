# Contributing

This repository is a pnpm + Turborepo monorepo. It builds against the core packages from [`tessera`](https://github.com/thakurabhishek7283/tessera), pinned in `deps.json`.

## Setup

```sh
nvm use            # Node 22
corepack enable    # pnpm 10 from the packageManager field
pnpm deps          # clones + builds tessera into external/ (or links ../tessera if you have it)
pnpm install
pnpm check         # lint, typecheck, unit tests, build
```

Component and end-to-end tests need Chromium. Install it with `npx playwright install --with-deps chromium`, or set `CHROMIUM_PATH` to an existing binary.

## Day to day

| Task | Command |
| --- | --- |
| Run the playground | `pnpm dev` |
| Unit tests | `pnpm test` (add `--filter @tessera-kit/annotator` to narrow) |
| Component tests in a browser | `pnpm test:browser` |
| End-to-end tests | `pnpm e2e` (tests that need the network are tagged `@network` and skipped unless `NETWORK_E2E=1`) |
| Page budgets (what a page pays, all dependencies included) | `pnpm budget` (after `pnpm build`) |
| Format | `pnpm format` |

## Conventions

- **Commits** follow Conventional Commits: `feat(annotator): …`, `fix(maps): …`, `docs: …`, `test: …`, `chore: …`. Keep each commit building and passing `pnpm check`.
- **TypeScript** is strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Exported functions and members carry explicit types, and `any` is an error.
- **Comments** explain *why*, not what. No commented-out code, no `console` in library code (use `ctx.logger`).
- **Kits never import each other.** They meet through the core's service registry (for example the annotator uses the `comments` service when one is registered).
- **Elements** use tokens only (no hard-coded colours), expose `part` names on the main internals and fire kebab-case `CustomEvent`s that bubble and are composed.
- **Accessibility** is part of done: keyboard operation, visible focus, labelled controls.
- **Public API changes** need a changeset: `pnpm changeset`.

## Releases

Merging changesets into `main` makes the Release workflow open a "Version Packages" pull request. Merging that pull request releases: the workflow publishes to npm (when `NPM_TOKEN` is set) and tags every bumped package as `<package>@<version>` (for example `@tessera-kit/chat@0.2.0`) on the commit that bumped it, with `scripts/release-tags.mjs`. Don't create release tags by hand.
