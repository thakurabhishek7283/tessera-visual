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
| Unit tests | `pnpm test` (add `--filter @tessera/annotator` to narrow) |
| Component tests in a browser | `pnpm test:browser` |
| End-to-end tests | `pnpm e2e` (tests that need the network are tagged `@network` and skipped unless `NETWORK_E2E=1`) |
| Format | `pnpm format` |

## Conventions

- **Commits** follow Conventional Commits: `feat(annotator): …`, `fix(maps): …`, `docs: …`, `test: …`, `chore: …`. Keep each commit building and passing `pnpm check`.
- **TypeScript** is strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Exported functions and members carry explicit types, and `any` is an error.
- **Comments** explain *why*, not what. No commented-out code, no `console` in library code (use `ctx.logger`).
- **Kits never import each other.** They meet through the core's service registry (for example the annotator uses the `comments` service when one is registered).
- **Elements** use tokens only (no hard-coded colours), expose `part` names on the main internals and fire kebab-case `CustomEvent`s that bubble and are composed.
- **Accessibility** is part of done: keyboard operation, visible focus, labelled controls.
- **Public API changes** need a changeset: `pnpm changeset`.
