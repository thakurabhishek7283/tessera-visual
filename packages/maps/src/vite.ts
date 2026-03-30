import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** What this plugin needs of Vite, so the package does not depend on it. */
interface VitePlugin {
  name: string;
  configureServer(server: {
    middlewares: {
      use(
        handler: (
          req: { url?: string },
          res: { setHeader(name: string, value: string): void; end(body: Uint8Array): void },
          next: () => void,
        ) => void,
      ): void;
    };
  }): void;
  generateBundle(this: {
    emitFile(file: { type: 'asset'; fileName: string; source: Uint8Array }): void;
  }): void;
}

export interface MapsWorkerOptions {
  /** Folder (inside the site root) the worker files are served from. Default `tessera-maps`. */
  dir?: string;
}

const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'] as const;

/**
 * Vite plugin that serves MapLibre's web worker. MapLibre 6 starts its worker from two files that
 * sit next to its own module, which a bundler moves away; this plugin serves both from one folder
 * in development and copies them into the build. Then point the feature at them:
 *
 * @example
 * // vite.config.ts
 * plugins: [tesseraMapsWorker()]
 * // tessera config
 * features: { maps: { enabled: true, workerUrl: `${import.meta.env.BASE_URL}tessera-maps/maplibre-gl-worker.mjs` } }
 */
export function tesseraMapsWorker(options: MapsWorkerOptions = {}): VitePlugin {
  const dir = options.dir ?? 'tessera-maps';
  const dist = join(
    dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')),
    'dist',
  );
  const read = (file: string): Uint8Array => readFileSync(join(dist, file));
  const pattern = new RegExp(
    `/${dir}/(${FILES.map((f) => f.replace('.', '\\.')).join('|')})(?:\\?.*)?$`,
  );
  return {
    name: 'tessera-maps-worker',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = req.url?.match(pattern)?.[1];
        if (!file) return next();
        res.setHeader('content-type', 'text/javascript');
        res.end(read(file));
      });
    },
    generateBundle() {
      for (const file of FILES)
        this.emitFile({ type: 'asset', fileName: `${dir}/${file}`, source: read(file) });
    },
  };
}
