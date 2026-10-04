import { defineConfig } from 'tsdown';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/autoload.ts',
    'src/elements/index.ts',
    'src/elements/setup.ts',
    'src/elements/tags/*.ts',
    'src/react/index.ts',
  ],
  // Reported by defineElement when two copies of the kit define the same tag.
  define: { __TESSERA_KIT_VERSION__: JSON.stringify(pkg.version) },
  outputOptions: {
    // A chunk holding a tag module defines elements when it loads. Keeping those under
    // dist/elements/ lets package.json mark exactly them as having side effects.
    chunkFileNames: (chunk) =>
      chunk.moduleIds.some((id) => /[\\/]src[\\/]elements[\\/](tags[\\/]|setup\.ts)/.test(id))
        ? 'elements/chunks/[name]-[hash].js'
        : '[name]-[hash].js',
  },
  format: 'esm',
  dts: true,
  clean: true,
  platform: 'browser',
  external: ['react', 'react/jsx-runtime'],
  // Internal helpers are not published, so they are bundled in.
  noExternal: [/^@tessera-internal\//],
});
