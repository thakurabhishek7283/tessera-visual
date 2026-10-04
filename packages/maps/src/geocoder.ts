import { TesseraError } from '@tessera-kit/core';
import type { MapsConfigValue } from './config.js';
import type { GeocodeResult, Geocoder, SearchOptions } from './types.js';

type Fetch = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface GeocoderDeps {
  fetch?: Fetch;
  /** Milliseconds between two requests to the same provider. */
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const abortError = (): TesseraError => new TesseraError('TIMEOUT', 'The search was cancelled');

/** A tiny LRU: a Map keeps insertion order, so re-inserting on a hit keeps the newest last. */
class Lru<V> {
  readonly #map = new Map<string, V>();
  constructor(private readonly size: number) {}
  get(key: string): V | undefined {
    const v = this.#map.get(key);
    if (v !== undefined) {
      this.#map.delete(key);
      this.#map.set(key, v);
    }
    return v;
  }
  set(key: string, value: V): void {
    this.#map.delete(key);
    this.#map.set(key, value);
    if (this.#map.size > this.size) this.#map.delete(this.#map.keys().next().value as string);
  }
}

/**
 * Serialises requests with a minimum gap between them (Nominatim's policy is one per second).
 * A request that is cancelled while it waits never goes out.
 */
export function createRateLimiter(
  minIntervalMs: number,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): <T>(job: () => Promise<T>, signal?: AbortSignal) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  let last = Number.NEGATIVE_INFINITY;
  return (job, signal) => {
    const run = tail.then(async () => {
      if (signal?.aborted) throw abortError();
      const wait = last + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      if (signal?.aborted) throw abortError();
      last = now();
      return job();
    });
    tail = run.catch(() => undefined);
    return run;
  };
}

const num = (v: unknown): number =>
  typeof v === 'string' || typeof v === 'number' ? Number(v) : Number.NaN;

function fromNominatim(raw: unknown): GeocodeResult[] {
  if (!Array.isArray(raw)) return [];
  const out: GeocodeResult[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    const lng = num(r.lon);
    const lat = num(r.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || typeof r.display_name !== 'string')
      continue;
    const box = Array.isArray(r.boundingbox) ? (r.boundingbox as unknown[]).map(num) : [];
    const [south, north, west, east] = box;
    const bbox =
      box.length === 4 && box.every(Number.isFinite)
        ? ([west, south, east, north] as [number, number, number, number])
        : undefined;
    out.push({ label: r.display_name, lng, lat, ...(bbox ? { bbox } : {}) });
  }
  return out;
}

function fromMaptiler(raw: unknown): GeocodeResult[] {
  const features = (raw as { features?: Array<Record<string, unknown>> } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: GeocodeResult[] = [];
  for (const f of features) {
    const center = f.center as unknown[] | undefined;
    const lng = num(center?.[0]);
    const lat = num(center?.[1]);
    const label = f.place_name ?? f.text;
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || typeof label !== 'string') continue;
    const box = Array.isArray(f.bbox) ? (f.bbox as unknown[]).map(num) : [];
    const bbox =
      box.length === 4 && box.every(Number.isFinite)
        ? (box as [number, number, number, number])
        : undefined;
    out.push({ label, lng, lat, ...(bbox ? { bbox } : {}) });
  }
  return out;
}

/**
 * Builds the geocoder for a configuration. Nominatim requests are queued at one per second and
 * results are cached (the 100 most recent searches), as its usage policy asks; for production,
 * point `url` at your own instance or use another provider.
 */
export function createGeocoder(
  config: MapsConfigValue['geocoder'],
  deps: GeocoderDeps = {},
): Geocoder {
  if (config.type === 'none') {
    return { search: async () => [], reverse: async () => null };
  }
  const doFetch: Fetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const limit = createRateLimiter(
    config.type === 'nominatim' ? (deps.minIntervalMs ?? 1000) : 0,
    deps.now,
    deps.sleep,
  );
  const searches = new Lru<GeocodeResult[]>(100);
  const reverses = new Lru<{ label: string } | null>(100);

  const get = async (url: string, signal: AbortSignal | undefined): Promise<unknown> => {
    const res = await doFetch(url, {
      ...(signal ? { signal } : {}),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      throw new TesseraError(
        res.status === 429 ? 'RATE_LIMITED' : 'UNKNOWN',
        `The geocoder answered ${res.status}`,
      );
    }
    return res.json();
  };

  const nominatim = (path: string, params: Record<string, string>): string => {
    const base = config.type === 'nominatim' ? config.url.replace(/\/$/, '') : '';
    const email = config.type === 'nominatim' && config.email ? { email: config.email } : {};
    return `${base}${path}?${new URLSearchParams({ format: 'jsonv2', ...params, ...email })}`;
  };

  return {
    async search(q: string, opts: SearchOptions = {}): Promise<GeocodeResult[]> {
      const text = q.trim();
      if (text.length < 2) return [];
      const count = Math.max(1, Math.min(opts.limit ?? 5, 10));
      const key = `${text.toLowerCase()}|${count}|${opts.bias?.map((n) => n.toFixed(1)).join(',') ?? ''}`;
      const cached = searches.get(key);
      if (cached) return cached;
      let url: string;
      if (config.type === 'nominatim') {
        const bias = opts.bias
          ? {
              viewbox: `${opts.bias[0] - 1},${opts.bias[1] + 1},${opts.bias[0] + 1},${opts.bias[1] - 1}`,
            }
          : {};
        url = nominatim('/search', { q: text, limit: String(count), ...bias });
      } else {
        const proximity = opts.bias ? `&proximity=${opts.bias[0]},${opts.bias[1]}` : '';
        url = `https://api.maptiler.com/geocoding/${encodeURIComponent(text)}.json?key=${encodeURIComponent(config.apiKey)}&limit=${count}${proximity}`;
      }
      const raw = await limit(() => get(url, opts.signal), opts.signal);
      const results = config.type === 'nominatim' ? fromNominatim(raw) : fromMaptiler(raw);
      searches.set(key, results);
      return results;
    },

    async reverse(lng, lat, opts = {}): Promise<{ label: string } | null> {
      const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
      const cached = reverses.get(key);
      if (cached !== undefined) return cached;
      const url =
        config.type === 'nominatim'
          ? nominatim('/reverse', { lon: String(lng), lat: String(lat), zoom: '18' })
          : `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${encodeURIComponent(config.apiKey)}&limit=1`;
      const raw = await limit(() => get(url, opts.signal), opts.signal);
      const first = (raw as { features?: Array<{ place_name?: unknown; text?: unknown }> } | null)
        ?.features?.[0];
      const label =
        config.type === 'nominatim'
          ? (raw as { display_name?: unknown } | null)?.display_name
          : (first?.place_name ?? first?.text);
      const result = typeof label === 'string' ? { label } : null;
      reverses.set(key, result);
      return result;
    },
  };
}
