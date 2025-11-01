import { describe, expect, it } from 'vitest';
import { MapsConfig } from '../src/index.js';

describe('MapsConfig', () => {
  it('accepts { enabled: true } alone and needs no API key', () => {
    const cfg = MapsConfig.parse({ enabled: true });
    expect(cfg.styleUrl).toContain('openfreemap.org');
    expect(cfg.geocoder.type).toBe('nominatim');
    expect(cfg.cluster.enabled).toBe(true);
    expect(cfg.attribution).toBe(true);
  });

  it('requires a key for the maptiler geocoder and refuses to hide attribution', () => {
    expect(() => MapsConfig.parse({ enabled: true, geocoder: { type: 'maptiler' } })).toThrow();
    expect(() => MapsConfig.parse({ enabled: true, attribution: false })).toThrow();
  });
});
