import * as z from 'zod/mini';

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
    w: num.check(z.gte(0)),
    h: num.check(z.gte(0)),
    /** Degrees, clockwise, around the centre. */
    rotation: z.optional(num),
  }),
  z.object({
    type: z.literal('ellipse'),
    cx: num,
    cy: num,
    rx: num.check(z.gte(0)),
    ry: num.check(z.gte(0)),
  }),
  /** Closed, at least three points. */
  z.object({
    type: z.literal('polygon'),
    points: z.array(PointSchema).check(z.minLength(3), z.maxLength(MAX_POINTS)),
  }),
  z.object({
    type: z.literal('polyline'),
    points: z.array(PointSchema).check(z.minLength(2), z.maxLength(MAX_POINTS)),
    arrowStart: z.optional(z.boolean()),
    arrowEnd: z.optional(z.boolean()),
  }),
  /** `[x, y, pressure]` samples of a brush stroke. */
  z.object({
    type: z.literal('freehand'),
    points: z.array(z.tuple([num, num, num])).check(z.minLength(1), z.maxLength(MAX_POINTS)),
  }),
  z.object({ type: z.literal('point'), x: num, y: num }),
  z.object({
    type: z.literal('text'),
    x: num,
    y: num,
    text: z.string().check(z.maxLength(MAX_TEXT)),
    fontSize: num.check(z.gte(1), z.lte(1000)),
  }),
]);

export type Geometry = z.infer<typeof GeometrySchema>;
export type GeometryType = Geometry['type'];
export type GeometryOf<T extends GeometryType> = Extract<Geometry, { type: T }>;

export const BodySchema = z.object({
  purpose: z.enum(['tagging', 'commenting', 'describing']),
  value: z.string().check(z.maxLength(5000)),
});
export type Body = z.infer<typeof BodySchema>;

const ColorString = z.string().check(z.minLength(1), z.maxLength(80));

/** Appearance. Colours are palette names (`blue`) or any CSS colour. */
export const StyleSchema = z.object({
  stroke: z.optional(ColorString),
  /** `none` draws no fill; anything else (or nothing) draws a light wash. */
  fill: z.optional(ColorString),
  strokeWidth: z.optional(num.check(z.gte(0), z.lte(200))),
  opacity: z.optional(num.check(z.gte(0), z.lte(1))),
});
export type Style = z.infer<typeof StyleSchema>;

export const AnnotationSchema = z.object({
  id: z.string().check(z.minLength(1), z.maxLength(80)),
  geometry: GeometrySchema,
  bodies: z.array(BodySchema).check(z.maxLength(100)),
  style: z.optional(StyleSchema),
  createdBy: z.optional(z.string().check(z.maxLength(120))),
  createdAt: z.string(),
  updatedAt: z.string(),
  hidden: z.optional(z.boolean()),
  locked: z.optional(z.boolean()),
});

/** geometry + bodies (tags and comments) + style. */
export type Annotation = z.infer<typeof AnnotationSchema>;

/** What callers pass to `add`: everything the engine fills in is optional. */
export type NewAnnotation = Omit<Annotation, 'id' | 'createdAt' | 'updatedAt' | 'bodies'> & {
  id?: string;
  bodies?: Body[];
  /** Kept when given (imports); otherwise the time of creation. */
  createdAt?: string;
  updatedAt?: string;
};

/** The first `tagging` body: the label of an annotation. */
export function labelOf(a: Pick<Annotation, 'bodies'>): string | undefined {
  return a.bodies.find((b) => b.purpose === 'tagging')?.value;
}

/** Whether the shape's inside takes part in hit testing and is painted. */
export function isFilled(style: Style | undefined): boolean {
  return style?.fill !== 'none';
}
