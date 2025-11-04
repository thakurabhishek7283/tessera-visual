import {
  createTessera,
  type PluginLoader,
  type TesseraConfig,
  type TesseraInstance,
  type ThemeMode,
} from '@tessera/core';
import { createStorage, createUploads } from '@tessera/storage';
import { createTransport } from '@tessera/transport';
import { SECTIONS } from './sections.js';
import { USERS } from './users.js';

export interface InstanceOptions {
  user: string;
  theme: ThemeMode;
  locale: string;
  enabled: Record<string, boolean>;
  configs: Record<string, Record<string, unknown>>;
}

/**
 * Builds the playground's Tessera instance. Every tab talks through BroadcastChannel and
 * IndexedDB, so the page works with no backend at all: annotations drawn in one tab show up in
 * another, and are still there after a reload.
 */
export async function createInstance(opts: InstanceOptions): Promise<TesseraInstance> {
  const demoUser = USERS[opts.user] ?? USERS.alice;
  if (!demoUser) throw new Error('no demo users');
  const features: TesseraConfig['features'] = Object.fromEntries(
    SECTIONS.filter((s) => s.id !== 'overview').map((s) => [
      s.id,
      { ...s.defaults, ...opts.configs[s.id], enabled: opts.enabled[s.id] ?? true },
    ]),
  );
  const plugins: Record<string, PluginLoader> = Object.fromEntries(
    SECTIONS.map((s) => [s.id, s.load]),
  );

  return createTessera(
    {
      appId: 'visual-playground',
      locale: opts.locale,
      theme: { mode: opts.theme },
      auth: { type: 'static', user: demoUser },
      transport: { type: 'local' },
      storage: { type: 'indexeddb', dbName: 'tessera-visual-playground' },
      uploads: { type: 'dataurl' },
      features,
    },
    {
      plugins,
      adapters: { storage: createStorage, uploads: createUploads, transport: createTransport },
    },
  );
}
