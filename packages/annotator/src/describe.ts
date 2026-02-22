import { bboxOf, type TextMeasure } from './geometry/bbox.js';
import type { Geometry } from './geometry/model.js';

type Translate = (key: string, params?: Record<string, string | number>) => string;

const round = (n: number): number => Math.round(n);

/**
 * A sentence a screen reader can use instead of the picture: "Rectangle at 120, 80, 200×150".
 * `t` supplies the words (`geometry.*` keys), so it follows the instance's language.
 */
export function describeGeometry(g: Geometry, t: Translate, measure?: TextMeasure): string {
  const box = bboxOf(g, measure);
  const at = { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) };
  switch (g.type) {
    case 'rect':
      return t('geometry.rect', at);
    case 'ellipse':
      return t('geometry.ellipse', at);
    case 'polygon':
      return t('geometry.polygon', { count: g.points.length });
    case 'polyline': {
      const first = g.points[0] as [number, number];
      const last = g.points[g.points.length - 1] as [number, number];
      if (g.arrowEnd || g.arrowStart) {
        return t('geometry.arrow', {
          x1: round(first[0]),
          y1: round(first[1]),
          x2: round(last[0]),
          y2: round(last[1]),
        });
      }
      return t('geometry.polyline', { count: g.points.length });
    }
    case 'freehand':
      return t('geometry.freehand', at);
    case 'point':
      return t('geometry.point', { x: round(g.x), y: round(g.y) });
    case 'text': {
      const text = g.text.replace(/\s+/g, ' ').trim();
      return t('geometry.text', { text: text.length > 40 ? `${text.slice(0, 39)}…` : text });
    }
  }
}
