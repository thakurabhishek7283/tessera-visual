import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/elements/index.ts', 'src/react/index.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  platform: 'browser',
  external: ['react', 'react/jsx-runtime'],
  // Internal helpers are not published, so they are bundled in.
  noExternal: [/^@tessera-internal\//],
});
