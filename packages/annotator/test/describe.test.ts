import { createI18n } from '@tessera/core';
import { describe, expect, it } from 'vitest';
import { describeGeometry } from '../src/describe.js';
import { de } from '../src/i18n/de.js';
import { en } from '../src/i18n/en.js';

const i18n = createI18n({ locale: 'en' });
i18n.addCatalog({ en, de });
const t = (key: string, params?: Record<string, string | number>): string => i18n.t(key, params);

describe('describeGeometry', () => {
  it('says where and how big a rectangle is', () => {
    expect(describeGeometry({ type: 'rect', x: 120.4, y: 80, w: 200, h: 149.6 }, t)).toBe(
      'Rectangle at 120, 80, 200×150',
    );
  });

  it('describes every shape', () => {
    const cases: Array<[Parameters<typeof describeGeometry>[0], string]> = [
      [{ type: 'ellipse', cx: 50, cy: 50, rx: 10, ry: 20 }, 'Ellipse at 40, 30, 20×40'],
      [
        {
          type: 'polygon',
          points: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        },
        'Polygon with 3 points',
      ],
      [
        {
          type: 'polyline',
          points: [
            [0, 0],
            [5, 5],
            [9, 9],
          ],
        },
        'Line with 3 points',
      ],
      [
        {
          type: 'polyline',
          points: [
            [1, 2],
            [30, 40],
          ],
          arrowEnd: true,
        },
        'Arrow from 1, 2 to 30, 40',
      ],
      [
        {
          type: 'freehand',
          points: [
            [0, 0, 0.5],
            [10, 4, 0.5],
          ],
        },
        'Freehand stroke at 0, 0, 10×4',
      ],
      [{ type: 'point', x: 7.2, y: 8.7 }, 'Point at 7, 9'],
      [{ type: 'text', x: 0, y: 0, text: 'Fire\n pit', fontSize: 12 }, 'Text “Fire pit”'],
    ];
    for (const [g, expected] of cases) expect(describeGeometry(g, t)).toBe(expected);
  });

  it('shortens long text', () => {
    const text = 'x'.repeat(100);
    const out = describeGeometry({ type: 'text', x: 0, y: 0, text, fontSize: 12 }, t);
    expect(out).toBe(`Text “${'x'.repeat(39)}…”`);
  });

  it('follows the language and the measurer', () => {
    i18n.setLocale('de');
    expect(describeGeometry({ type: 'rect', x: 1, y: 2, w: 3, h: 4 }, t)).toBe(
      'Rechteck bei 1, 2, 3×4',
    );
    expect(
      describeGeometry({ type: 'text', x: 0, y: 0, text: 'a', fontSize: 10 }, t, () => ({
        w: 50,
        h: 12,
      })),
    ).toBe('Text „a“');
    i18n.setLocale('en');
  });

  it('has a tool name in both languages for every tool', async () => {
    const { TOOL_IDS } = await import('../src/config.js');
    for (const id of TOOL_IDS) {
      expect(en[`annotator.tool.${id}`]).toBeTruthy();
      expect(de[`annotator.tool.${id}`]).toBeTruthy();
    }
  });
});
