import { z } from 'zod';

/** A position in world coordinates: image pixels, or whiteboard units. */
export type Point = [number, number];

/** An axis-aligned rectangle. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const num = z.number();
const PointSchema = z.tuple([num, num]);

export const MAX_POINTS = 20_000;
export const MAX_TEXT = 2000;

/** What an annotation outlines. Every shape is stored in world coordinates. */
export const GeometrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rect'),
    x: num,
    y: num,
    w: num.min(0),
    h: num.min(0),
    /** Degrees, clockwise, around the centre. */
    rotation: num.optional(),
  }),
  z.object({
    type: z.literal('ellipse'),
    cx: num,
    cy: num,
    rx: num.min(0),
    ry: num.min(0),
  }),
  /** Closed, at least three points. */
  z.object({ type: z.literal('polygon'), points: z.array(PointSchema).min(3).max(MAX_POINTS) }),
  z.object({
    type: z.literal('polyline'),
    points: z.array(PointSchema).min(2).max(MAX_POINTS),
    arrowStart: z.boolean().optional(),
    arrowEnd: z.boolean().optional(),
  }),
  /** `[x, y, pressure]` samples of a brush stroke. */
  z.object({
    type: z.literal('freehand'),
    points: z
      .array(z.tuple([num, num, num]))
      .min(1)
      .max(MAX_POINTS),
  }),
  z.object({ type: z.literal('point'), x: num, y: num }),
  z.object({
    type: z.literal('text'),
    x: num,
    y: num,
    text: z.string().max(MAX_TEXT),
    fontSize: num.min(1).max(1000),
  }),
]);

export type Geometry = z.infer<typeof GeometrySchema>;
export type GeometryType = Geometry['type'];
export type GeometryOf<T extends GeometryType> = Extract<Geometry, { type: T }>;

export const BodySchema = z.object({
  purpose: z.enum(['tagging', 'commenting', 'describing']),
  value: z.string().max(5000),
});
export type Body = z.infer<typeof BodySchema>;

const ColorString = z.string().min(1).max(80);

/** Appearance. Colours are palette names (`blue`) or any CSS colour. */
export const StyleSchema = z.object({
  stroke: ColorString.optional(),
  /** `none` draws no fill; anything else (or nothing) draws a light wash. */
  fill: ColorString.optional(),
  strokeWidth: num.min(0).max(200).optional(),
  opacity: num.min(0).max(1).optional(),
});
export type Style = z.infer<typeof StyleSchema>;

export const AnnotationSchema = z.object({
  id: z.string().min(1).max(80),
  geometry: GeometrySchema,
  bodies: z.array(BodySchema).max(100),
  style: StyleSchema.optional(),
  createdBy: z.string().max(120).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
});

/** geometry + bodies (tags and comments) + style. */
export type Annotation = z.infer<typeof AnnotationSchema>;

/** What callers pass to `add`: everything the engine fills in is optional. */
export type NewAnnotation = Omit<Annotation, 'id' | 'createdAt' | 'updatedAt' | 'bodies'> & {
  id?: string;
  bodies?: Body[];
};

/** The first `tagging` body: the label of an annotation. */
export function labelOf(a: Pick<Annotation, 'bodies'>): string | undefined {
  return a.bodies.find((b) => b.purpose === 'tagging')?.value;
}

/** Whether the shape's inside takes part in hit testing and is painted. */
export function isFilled(style: Style | undefined): boolean {
  return style?.fill !== 'none';
}
