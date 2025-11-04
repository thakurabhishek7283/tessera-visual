import type { PluginLoader, TesseraInstance } from '@tessera/core';
import { html, type TemplateResult } from 'lit';
import { z } from 'zod';

/** One kit in the playground: its plugin, its option schema and what it shows. */
export interface Section {
  id: string;
  label: string;
  /** What the section demonstrates, shown above it. */
  blurb: string;
  schema: z.ZodType;
  load: PluginLoader;
  /** Defaults on top of `{ enabled: true }`. */
  defaults?: Record<string, unknown>;
  render(ctx: SectionContext): TemplateResult;
}

export interface SectionContext {
  instance: TesseraInstance;
  user: string;
}

const overview: Section = {
  id: 'overview',
  label: 'Overview',
  blurb: 'The kits of this repository appear here as they are built.',
  schema: z.object({ enabled: z.boolean() }),
  load: () => Promise.reject(new Error('The overview has no plugin')),
  render: () => html`<p>Image annotation, a whiteboard and maps.</p>`,
};

/** One entry per kit, in tab order. */
export const SECTIONS: Section[] = [overview];
