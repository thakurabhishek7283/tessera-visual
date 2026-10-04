import type { PluginLoader, TesseraInstance } from '@tessera-kit/core';
import type { TemplateResult } from 'lit';
import type { z } from 'zod/mini';
import { annotateSection } from './sections/annotate.js';

/** One kit in the playground: its plugin, its option schema and what it shows. */
export interface Section {
  id: string;
  label: string;
  /** The feature this tab shows, when it is not named like the tab (the whiteboard is `annotator`). */
  feature?: string;
  /** What the section demonstrates, shown above it. */
  blurb: string;
  /** Options of the feature. Only the first tab of a feature needs it: it makes the config panel. */
  schema?: z.core.$ZodType;
  load: PluginLoader;
  /** Defaults on top of `{ enabled: true }`. */
  defaults?: Record<string, unknown>;
  render(ctx: SectionContext): TemplateResult;
}

export interface SectionContext {
  instance: TesseraInstance;
  user: string;
}

import { mapsSection } from './sections/maps.js';
import { pickerSection } from './sections/picker.js';
import { whiteboardSection } from './sections/whiteboard.js';

/** One entry per tab, in order. */
export const SECTIONS: Section[] = [annotateSection, whiteboardSection, mapsSection, pickerSection];

/** The tabs that own a feature: one config panel and one plugin each. */
export const FEATURES: Section[] = SECTIONS.filter((s) => s.schema);

/** The feature id a tab shows. */
export const featureOf = (s: Section): string => s.feature ?? s.id;
