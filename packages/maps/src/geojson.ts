import type { LngLatBounds, MapMarker } from './types.js';

export interface MarkerFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { id: string; title: string; color: string };
}

export interface MarkerCollection {
  type: 'FeatureCollection';
  features: MarkerFeature[];
}

const validPosition = (m: { lng: number; lat: number }): boolean =>
  Number.isFinite(m.lng) &&
  Number.isFinite(m.lat) &&
  Math.abs(m.lng) <= 180 &&
  Math.abs(m.lat) <= 90;

/**
 * Markers as a GeoJSON collection for a map source. Markers with an impossible position are
 * dropped (a bad row must not break the map); when ids repeat, the last one wins.
 */
export function markersToGeoJSON(
  markers: readonly MapMarker[],
  color: (value: string | undefined) => string,
): MarkerCollection {
  const byId = new Map<string, MapMarker>();
  for (const m of markers) if (validPosition(m)) byId.set(m.id, m);
  return {
    type: 'FeatureCollection',
    features: [...byId.values()].map((m) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] as [number, number] },
      properties: { id: m.id, title: m.title ?? '', color: color(m.color) },
    })),
  };
}

/** The smallest box around the markers, or `null` when there are none. */
export function boundsOf(markers: readonly MapMarker[]): LngLatBounds | null {
  const valid = markers.filter(validPosition);
  if (valid.length === 0) return null;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const m of valid) {
    west = Math.min(west, m.lng);
    east = Math.max(east, m.lng);
    south = Math.min(south, m.lat);
    north = Math.max(north, m.lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

/** Colours MapLibre can paint: it cannot resolve CSS variables, so theme names are looked up. */
const THEME_COLORS = ['primary', 'danger', 'warning', 'success'] as const;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([\d\s.,%/-]+\))$/i;

export function isThemeColor(value: string): boolean {
  return (THEME_COLORS as readonly string[]).includes(value);
}

/** `value` as a concrete colour: a theme name goes through `read`, a plain CSS colour passes. */
export function mapColor(
  value: string | undefined,
  read: (name: string) => string,
  fallback = 'primary',
): string {
  const v = value?.trim() ?? '';
  if (isThemeColor(v)) return read(`--tessera-color-${v}`) || '#1d4ed8';
  if (v && SAFE_COLOR.test(v)) return v;
  return read(`--tessera-color-${fallback}`) || '#1d4ed8';
}
