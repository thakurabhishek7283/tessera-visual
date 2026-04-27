# 1. Build against `tessera` through `external/` and `link:` overrides

Status: accepted

## Context

The kits in this repository depend on `@tessera/core`, `@tessera/elements`, `@tessera/storage` and friends, which live in the [`tessera`](https://github.com/thakurabhishek7283/tessera) repository and are not published to npm yet. The repository must build the same way on a laptop and in CI, from a fresh clone, without a registry.

## Decision

- `deps.json` pins the repository and tag of every sibling (`tessera` at `v0.1.0`).
- `scripts/fetch-deps.mjs` puts each sibling at `external/<name>`: a symlink to `../<name>` when that checkout exists next to this one (live source while developing both), otherwise a shallow clone of the pinned tag (`--ci` always clones). It then installs and builds the packages.
- The root `package.json` maps every `@tessera/*` name to `link:./external/tessera/packages/<pkg>` through `pnpm.overrides`.
- Packages still declare ordinary semver ranges (`"@tessera/core": "^0.1.0"`), so their manifests are already correct for the day the packages are published.
- Vite and Vitest configs `dedupe` `lit` and `@lit/context`, because the linked packages resolve their own copy from `external/tessera/node_modules`.

## Consequences

- A clean clone builds with `pnpm deps && pnpm install && pnpm check`.
- Bumping the core means changing `ref` in `deps.json`.
- Once the packages are on npm, `external/`, `deps.json`, `scripts/fetch-deps.mjs` and the overrides are deleted and nothing else changes.
- The `link:` overrides worked with pnpm 10.28 without needing the `pnpm-workspace.yaml` fallback, so that fallback is not used.
