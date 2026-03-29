import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/elements/index.ts', 'src/react/index.ts'],
    format: 'esm',
    dts: true,
    // `pnpm build` empties dist first: two configs would otherwise clean each other's output.
    clean: false,
    platform: 'browser',
    external: ['react', 'react/jsx-runtime'],
    // Internal helpers are not published, so they are bundled in.
    noExternal: [/^@tessera-internal\//],
  },
  {
    // The Vite plugin runs in Node, at build time.
    entry: ['src/vite.ts'],
    format: 'esm',
    dts: true,
    clean: false,
    platform: 'node',
    // Keep .js (the package is type: module), like the browser entries.
    fixedExtension: false,
  },
]);
