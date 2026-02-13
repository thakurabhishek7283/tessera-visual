import { z } from 'zod';

/** Named palette colours. They resolve to `--tessera-annotator-<name>` custom properties. */
export const TOKEN_COLORS = [
  'blue',
  'red',
  'green',
  'amber',
  'purple',
  'teal',
  'pink',
  'gray',
] as const;

/** A palette colour name. Style fields also accept any CSS colour string. */
export const TokenColor = z.enum(TOKEN_COLORS);
export type TokenColor = z.infer<typeof TokenColor>;

export const TOOL_IDS = [
  'select',
  'pan',
  'rect',
  'ellipse',
  'polygon',
  'polyline',
  'arrow',
  'freehand',
  'point',
  'text',
  'eraser',
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

/** Options of the `annotator` feature. `{ enabled: true }` alone is valid. */
export const AnnotatorConfig = z.object({
  enabled: z.boolean(),
  tools: z
    .array(z.enum(TOOL_IDS))
    .default(['select', 'rect', 'ellipse', 'polygon', 'arrow', 'freehand', 'point', 'text'])
    .describe(
      'Tools offered in the toolbar, in order. `pan` is always available with space or middle mouse.',
    ),
  defaultTool: z.enum(TOOL_IDS).default('select').describe('Tool active on start.'),
  labels: z
    .array(z.object({ value: z.string().min(1).max(60), color: TokenColor }))
    .default([])
    .describe('Label vocabulary. The label colour becomes the stroke colour of its shapes.'),
  requireLabel: z
    .boolean()
    .default(false)
    .describe('Ask for a label after drawing a shape; cancelling discards the shape.'),
  allowFreeTextLabels: z
    .boolean()
    .default(true)
    .describe('Let people type labels that are not in the vocabulary.'),
  comments: z
    .boolean()
    .default(true)
    .describe(
      'Show a discussion for the selected shape: the `comments` kit when enabled, else a note field.',
    ),
  readOnly: z
    .boolean()
    .default(false)
    .describe('Show annotations without letting anyone change them.'),
  snapping: z
    .object({
      enabled: z.boolean().default(true),
      tolerancePx: z.number().min(0).max(40).default(8),
    })
    .default({ enabled: true, tolerancePx: 8 })
    .describe('Snap points to the vertices and edges of other shapes while drawing or editing.'),
  freehand: z
    .object({
      size: z.number().min(1).max(100).default(6),
      thinning: z.number().min(-1).max(1).default(0.5),
      smoothing: z.number().min(0).max(1).default(0.5),
      streamline: z.number().min(0).max(1).default(0.5),
    })
    .default({ size: 6, thinning: 0.5, smoothing: 0.5, streamline: 0.5 })
    .describe('Brush of the freehand tool, passed to perfect-freehand.'),
  persistence: z
    .enum(['none', 'storage'])
    .default('storage')
    .describe(
      '`storage` keeps each set in the `annotator.sets` collection, keyed by `set-id` or the image URL.',
    ),
});

export type AnnotatorConfigValue = z.infer<typeof AnnotatorConfig>;
