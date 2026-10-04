import * as z from 'zod/mini';

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
    ._default(z.array(z.enum(TOOL_IDS)), [
      'select',
      'rect',
      'ellipse',
      'polygon',
      'arrow',
      'freehand',
      'point',
      'text',
    ])
    .check(
      z.describe(
        'Tools offered in the toolbar, in order. `pan` is always available with space or middle mouse.',
      ),
    ),
  defaultTool: z._default(z.enum(TOOL_IDS), 'select').check(z.describe('Tool active on start.')),
  labels: z
    ._default(
      z.array(
        z.object({ value: z.string().check(z.minLength(1), z.maxLength(60)), color: TokenColor }),
      ),
      [],
    )
    .check(
      z.describe('Label vocabulary. The label colour becomes the stroke colour of its shapes.'),
    ),
  requireLabel: z
    ._default(z.boolean(), false)
    .check(z.describe('Ask for a label after drawing a shape; cancelling discards the shape.')),
  allowFreeTextLabels: z
    ._default(z.boolean(), true)
    .check(z.describe('Let people type labels that are not in the vocabulary.')),
  comments: z
    ._default(z.boolean(), true)
    .check(
      z.describe(
        'Show a discussion for the selected shape: the `comments` kit when enabled, else a note field.',
      ),
    ),
  readOnly: z
    ._default(z.boolean(), false)
    .check(z.describe('Show annotations without letting anyone change them.')),
  snapping: z
    ._default(
      z.object({
        enabled: z._default(z.boolean(), true),
        tolerancePx: z._default(z.number().check(z.gte(0), z.lte(40)), 8),
      }),
      { enabled: true, tolerancePx: 8 },
    )
    .check(
      z.describe('Snap points to the vertices and edges of other shapes while drawing or editing.'),
    ),
  freehand: z
    ._default(
      z.object({
        size: z._default(z.number().check(z.gte(1), z.lte(100)), 6),
        thinning: z._default(z.number().check(z.gte(-1), z.lte(1)), 0.5),
        smoothing: z._default(z.number().check(z.gte(0), z.lte(1)), 0.5),
        streamline: z._default(z.number().check(z.gte(0), z.lte(1)), 0.5),
      }),
      { size: 6, thinning: 0.5, smoothing: 0.5, streamline: 0.5 },
    )
    .check(z.describe('Brush of the freehand tool, passed to perfect-freehand.')),
  minimap: z
    ._default(z.boolean(), false)
    .check(
      z.describe('Show an overview of the whole surface in a corner; drag in it to move the view.'),
    ),
  persistence: z
    ._default(z.enum(['none', 'storage']), 'storage')
    .check(
      z.describe(
        '`storage` keeps each set in the `annotator.sets` collection, keyed by `set-id` or the image URL.',
      ),
    ),
});

export type AnnotatorConfigValue = z.infer<typeof AnnotatorConfig>;
