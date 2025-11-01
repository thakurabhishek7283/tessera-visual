import { describe, expect, it } from 'vitest';
import { AnnotatorConfig } from '../src/index.js';

describe('AnnotatorConfig', () => {
  it('accepts { enabled: true } alone and fills every default', () => {
    const cfg = AnnotatorConfig.parse({ enabled: true });
    expect(cfg.tools).toContain('rect');
    expect(cfg.defaultTool).toBe('select');
    expect(cfg.snapping).toEqual({ enabled: true, tolerancePx: 8 });
    expect(cfg.persistence).toBe('storage');
    expect(cfg.readOnly).toBe(false);
  });

  it('rejects unknown tools and label colours', () => {
    expect(() => AnnotatorConfig.parse({ enabled: true, tools: ['lasso'] })).toThrow();
    expect(() =>
      AnnotatorConfig.parse({ enabled: true, labels: [{ value: 'x', color: 'chartreuse' }] }),
    ).toThrow();
  });
});
