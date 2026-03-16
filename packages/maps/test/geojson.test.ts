import { describe, expect, it } from 'vitest';
import { boundsOf, mapColor, markersToGeoJSON } from '../src/geojson.js';

const tag = (c: string | undefined): string => `c:${c ?? ''}`;

describe('markersToGeoJSON', () => {
  it('turns markers into point features with their id, title and resolved colour', () => {
    const out = markersToGeoJSON(
      [
        { id: 'a', lng: 8.54, lat: 47.37, title: 'Zürich', color: 'danger' },
        { id: 'b', lng: -122.4, lat: 37.77 },
      ],
      tag,
    );
    expect(out.type).toBe('FeatureCollection');
    expect(out.features[0]).toEqual({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [8.54, 47.37] },
      properties: { id: 'a', title: 'Zürich', color: 'c:danger' },
    });
    expect(out.features[1]?.properties).toEqual({ id: 'b', title: '', color: 'c:' });
  });

  it('drops markers with an impossible position instead of breaking the map', () => {
    const out = markersToGeoJSON(
      [
        { id: 'ok', lng: 0, lat: 0 },
        { id: 'nan', lng: Number.NaN, lat: 0 },
        { id: 'far', lng: 200, lat: 0 },
        { id: 'pole', lng: 0, lat: 91 },
      ],
      tag,
    );
    expect(out.features.map((f) => f.properties.id)).toEqual(['ok']);
  });

  it('keeps the last marker when an id repeats', () => {
    const out = markersToGeoJSON(
      [
        { id: 'a', lng: 1, lat: 1 },
        { id: 'a', lng: 2, lat: 2 },
      ],
      tag,
    );
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.geometry.coordinates).toEqual([2, 2]);
  });

  it('handles two thousand markers', () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({
      id: `m${i}`,
      lng: (i % 360) - 180,
      lat: (i % 170) - 85,
    }));
    expect(markersToGeoJSON(many, tag).features).toHaveLength(2000);
  });
});

describe('boundsOf', () => {
  it('is the box around the markers', () => {
    expect(
      boundsOf([
        { id: 'a', lng: 8, lat: 47 },
        { id: 'b', lng: 10, lat: 45 },
        { id: 'c', lng: 9, lat: 50 },
      ]),
    ).toEqual([
      [8, 45],
      [10, 50],
    ]);
  });

  it('is null without usable markers', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ id: 'x', lng: Number.NaN, lat: 0 }])).toBeNull();
  });

  it('is a point for a single marker', () => {
    expect(boundsOf([{ id: 'a', lng: 1, lat: 2 }])).toEqual([
      [1, 2],
      [1, 2],
    ]);
  });
});

describe('mapColor', () => {
  const read = (name: string): string =>
    ({ '--tessera-color-primary': '#123456', '--tessera-color-danger': '#aa0000' })[name] ?? '';

  it('looks theme names up and passes plain CSS colours through', () => {
    expect(mapColor('danger', read)).toBe('#aa0000');
    expect(mapColor('#00ff00', read)).toBe('#00ff00');
    expect(mapColor('rgb(1, 2, 3)', read)).toBe('rgb(1, 2, 3)');
    expect(mapColor('tomato', read)).toBe('tomato');
  });

  it('falls back to the primary colour for anything else, including CSS that could do harm', () => {
    expect(mapColor(undefined, read)).toBe('#123456');
    expect(mapColor('url(https://x/y)', read)).toBe('#123456');
    expect(mapColor('red; background: url(x)', read)).toBe('#123456');
  });

  it('uses a built-in blue when the theme defines nothing', () => {
    expect(mapColor('primary', () => '')).toBe('#1d4ed8');
  });
});
