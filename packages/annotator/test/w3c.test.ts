import { describe, expect, it } from 'vitest';
import type { Annotation, Geometry } from '../src/geometry/model.js';
import { AnnotationSchema } from '../src/geometry/model.js';
import { exportW3C, importW3C, parseSvgSelector, W3C_CONTEXT } from '../src/interop/w3c.js';

const make = (geometry: Geometry, extra: Partial<Annotation> = {}): Annotation => ({
  id: 'a1',
  geometry,
  bodies: [
    { purpose: 'tagging', value: 'tent' },
    { purpose: 'commenting', value: 'Near the <water> & "shade"' },
  ],
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-02T11:30:00.000Z',
  createdBy: 'alice',
  ...extra,
});

const geometries: Array<[string, Geometry]> = [
  ['rect', { type: 'rect', x: 10, y: 20.5, w: 30, h: 40 }],
  ['rotated rect', { type: 'rect', x: 10, y: 20, w: 30, h: 40, rotation: 30 }],
  ['ellipse', { type: 'ellipse', cx: 50, cy: 60, rx: 10, ry: 5 }],
  [
    'polygon',
    {
      type: 'polygon',
      points: [
        [0, 0],
        [10, 0],
        [5, 8],
      ],
    },
  ],
  [
    'polyline',
    {
      type: 'polyline',
      points: [
        [0, 0],
        [10, 10],
      ],
    },
  ],
  [
    'arrow',
    {
      type: 'polyline',
      points: [
        [0, 0],
        [10, 10],
        [20, 0],
      ],
      arrowStart: true,
      arrowEnd: true,
    },
  ],
  [
    'freehand',
    {
      type: 'freehand',
      points: [
        [0, 0, 0.5],
        [5, 5, 0.5],
        [9, 2, 0.5],
      ],
    },
  ],
  ['point', { type: 'point', x: 3, y: 4 }],
  ['text', { type: 'text', x: 5, y: 6, text: 'Fire <pit> & "co"\nline two', fontSize: 14 }],
];

describe('exportW3C', () => {
  it('writes the Web Annotation shape with bodies, target and times', () => {
    const [out] = exportW3C([make({ type: 'rect', x: 1, y: 2, w: 3, h: 4 })], 'https://x/y.jpg');
    expect(out).toMatchObject({
      '@context': W3C_CONTEXT,
      type: 'Annotation',
      id: 'urn:tessera:annotation:a1',
      body: [
        { type: 'TextualBody', purpose: 'tagging', value: 'tent' },
        { type: 'TextualBody', purpose: 'commenting' },
      ],
      target: {
        source: 'https://x/y.jpg',
        selector: {
          type: 'FragmentSelector',
          conformsTo: 'http://www.w3.org/TR/media-frags/',
          value: 'xywh=pixel:1,2,3,4',
        },
      },
      created: '2026-03-01T10:00:00.000Z',
      modified: '2026-03-02T11:30:00.000Z',
      creator: { type: 'Person', id: 'alice' },
    });
  });

  it('uses an SvgSelector for everything but an unrotated rect', () => {
    const [out] = exportW3C([make({ type: 'ellipse', cx: 1, cy: 2, rx: 3, ry: 4 })], 's');
    expect(out?.target.selector).toEqual({
      type: 'SvgSelector',
      value: '<svg xmlns="http://www.w3.org/2000/svg"><ellipse cx="1" cy="2" rx="3" ry="4"/></svg>',
    });
  });
});

describe('round trip', () => {
  it.each(geometries)('%s survives export and import', (_name, geometry) => {
    const original = make(geometry);
    const { annotations, warnings } = importW3C(exportW3C([original], 'src'));
    expect(warnings).toEqual([]);
    expect(annotations).toHaveLength(1);
    const [back] = annotations;
    expect(back?.geometry).toEqual(geometry);
    expect(back?.id).toBe('a1');
    expect(back?.bodies).toEqual(original.bodies);
    expect(back?.createdBy).toBe('alice');
    expect(back?.createdAt).toBe(original.createdAt);
    expect(back?.updatedAt).toBe(original.updatedAt);
  });

  it('produces annotations the schema accepts', () => {
    for (const [, geometry] of geometries) {
      const { annotations } = importW3C(exportW3C([make(geometry)], 'src'));
      const a = annotations[0];
      const parsed = AnnotationSchema.safeParse({
        id: 'x',
        createdAt: 't',
        updatedAt: 't',
        bodies: [],
        ...a,
      });
      expect(parsed.success).toBe(true);
    }
  });
});

describe('importW3C: foreign documents', () => {
  const svg = (inner: string): unknown => [
    {
      type: 'Annotation',
      target: { selector: { type: 'SvgSelector', value: `<svg>${inner}</svg>` } },
    },
  ];

  it('accepts a single body object, a bare string body and an array target and selector', () => {
    const out = importW3C([
      {
        id: 'https://example.com/a/1',
        body: { type: 'TextualBody', purpose: 'commenting', value: 'one' },
        target: [{ source: 's', selector: [{ type: 'FragmentSelector', value: 'xywh=1,2,3,4' }] }],
      },
      {
        body: 'plain',
        target: { selector: { type: 'FragmentSelector', value: 'xywh=pixel:0,0,5,5' } },
      },
    ]);
    expect(out.warnings).toEqual([]);
    expect(out.annotations[0]?.bodies).toEqual([{ purpose: 'commenting', value: 'one' }]);
    expect(out.annotations[0]?.id).toBe('https://example.com/a/1');
    expect(out.annotations[1]?.bodies).toEqual([{ purpose: 'commenting', value: 'plain' }]);
  });

  it('maps classifying to tagging and warns about other purposes', () => {
    const out = importW3C([
      {
        body: [
          { type: 'TextualBody', purpose: 'classifying', value: 'a' },
          { type: 'TextualBody', purpose: 'highlighting', value: 'b' },
        ],
        target: { selector: { type: 'FragmentSelector', value: 'xywh=0,0,1,1' } },
      },
    ]);
    expect(out.annotations[0]?.bodies).toEqual([
      { purpose: 'tagging', value: 'a' },
      { purpose: 'commenting', value: 'b' },
    ]);
    expect(out.warnings).toHaveLength(1);
  });

  it('reads circles, lines, groups and straight paths with relative and axis commands', () => {
    expect(importW3C(svg('<g><circle cx="5" cy="6" r="3"/></g>')).annotations[0]?.geometry).toEqual(
      {
        type: 'ellipse',
        cx: 5,
        cy: 6,
        rx: 3,
        ry: 3,
      },
    );
    expect(importW3C(svg('<line x1="0" y1="1" x2="2" y2="3"/>')).annotations[0]?.geometry).toEqual({
      type: 'polyline',
      points: [
        [0, 1],
        [2, 3],
      ],
    });
    expect(importW3C(svg('<path d="M10 10 h20 v20 H10 Z"/>')).annotations[0]?.geometry).toEqual({
      type: 'polygon',
      points: [
        [10, 10],
        [30, 10],
        [30, 30],
        [10, 30],
      ],
    });
    expect(importW3C(svg('<path d="m0,0 l5,5 5,0"/>')).annotations[0]?.geometry).toEqual({
      type: 'polyline',
      points: [
        [0, 0],
        [5, 5],
        [10, 5],
      ],
    });
  });

  it('decodes entities in text', () => {
    const out = importW3C(svg('<text x="1" y="2" font-size="12">a &amp; b &lt;c&gt; &#65;</text>'));
    expect(out.annotations[0]?.geometry).toMatchObject({ text: 'a & b <c> A' });
  });

  const rejected: Array<[string, unknown]> = [
    ['unbalanced tags', svg('<polygon points="0,0 1,1 2,0">')],
    [
      'text outside of tags',
      [
        {
          target: {
            selector: { type: 'SvgSelector', value: '<svg>junk<rect width="1" height="1"/></svg>' },
          },
        },
      ],
    ],
    ['a script element', svg('<script>alert(1)</script><rect width="1" height="1"/>')],
    ['an image element', svg('<image href="https://evil/x.png"/><rect width="1" height="1"/>')],
    ['a foreignObject', svg('<foreignObject><div/></foreignObject>')],
    ['two shapes', svg('<rect width="1" height="1"/><rect width="2" height="2"/>')],
    ['curves', svg('<path d="M0 0 C 1 1 2 2 3 3"/>')],
    [
      'a doctype',
      [
        {
          target: {
            selector: {
              type: 'SvgSelector',
              value: '<!DOCTYPE svg [<!ENTITY x "y">]><svg><rect width="1" height="1"/></svg>',
            },
          },
        },
      ],
    ],
    ['no shape', svg('<g/>')],
    ['a polygon of two points', svg('<polygon points="0,0 1,1"/>')],
    ['odd coordinates', svg('<polygon points="0,0 1,1 2"/>')],
    ['NaN', svg('<rect width="abc" height="1"/>')],
    [
      'percent fragments',
      [{ target: { selector: { type: 'FragmentSelector', value: 'xywh=percent:10,10,50,50' } } }],
    ],
    ['a missing selector', [{ target: 'https://x/y.jpg' }]],
    ['an unknown selector', [{ target: { selector: { type: 'CssSelector', value: 'img' } } }]],
    ['a non-object', ['hello']],
    ['a skewed transform', svg('<rect width="1" height="1" transform="skewX(20)"/>')],
  ];
  it.each(rejected)('skips an annotation with %s, with a warning and no throw', (_name, input) => {
    const out = importW3C(input);
    expect(out.annotations).toEqual([]);
    expect(out.warnings).toHaveLength(1);
  });

  it('imports the good annotations of a list and warns about the bad ones', () => {
    const good = exportW3C([make({ type: 'point', x: 1, y: 2 })], 's')[0];
    const out = importW3C([good, { target: 'nope' }, good]);
    expect(out.annotations).toHaveLength(2);
    expect(out.warnings).toEqual([
      'annotation 2: no selector (the whole target cannot become a shape)',
    ]);
  });

  it('refuses something that is not a list', () => {
    expect(importW3C({ not: 'a list' }).warnings).toHaveLength(1);
  });

  it('refuses an enormous SVG', () => {
    const big = `<svg><polygon points="${'0,0 '.repeat(300_000)}"/></svg>`;
    expect(parseSvgSelector(big)).toHaveProperty('error');
  });
});
