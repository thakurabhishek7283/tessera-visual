import { tesseraMapsWorker } from '@tessera/maps/vite';
import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo>/, so CI passes BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [tesseraMapsWorker()],
  resolve: { dedupe: ['lit', '@lit/context'] },
  build: { target: 'es2022', sourcemap: true },
});
