import { describe, expect, it, vi } from 'vitest';
import { createGeocoder, createRateLimiter } from '../src/geocoder.js';

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

const nominatim = { type: 'nominatim' as const, url: 'https://nominatim.example' };

describe('createRateLimiter', () => {
  it('spaces jobs by the minimum interval and runs them in order', async () => {
    let clock = 0;
    const slept: number[] = [];
    const limit = createRateLimiter(
      1000,
      () => clock,
      async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    );
    const order: number[] = [];
    await Promise.all([1, 2, 3].map((n) => limit(async () => order.push(n))));
    expect(order).toEqual([1, 2, 3]);
    expect(slept).toEqual([1000, 1000]);
  });

  it('does not wait when enough time has passed', async () => {
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const limit = createRateLimiter(1000, () => clock, sleep);
    await limit(async () => 1);
    clock += 5000;
    await limit(async () => 2);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('never sends a request that was cancelled while it waited', async () => {
    let clock = 0;
    const limit = createRateLimiter(
      1000,
      () => clock,
      async (ms) => {
        clock += ms;
      },
    );
    const controller = new AbortController();
    const first = limit(async () => 'first');
    const job = vi.fn(async () => 'second');
    const second = limit(job, controller.signal);
    controller.abort();
    await expect(second).rejects.toMatchObject({ code: 'TIMEOUT' });
    await first;
    expect(job).not.toHaveBeenCalled();
  });

  it('keeps going after a failed job', async () => {
    const limit = createRateLimiter(0);
    await expect(limit(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(limit(async () => 'fine')).resolves.toBe('fine');
  });
});

describe('Nominatim geocoder', () => {
  const rows = [
    {
      display_name: 'Zürich, Switzerland',
      lat: '47.3744',
      lon: '8.5410',
      boundingbox: ['47.32', '47.43', '8.45', '8.63'],
    },
    { display_name: 'No box', lat: '1', lon: '2' },
    { display_name: 'Broken', lat: 'x', lon: '2' },
  ];

  it('searches with the documented parameters, including the contact email', async () => {
    const fetchSpy = vi.fn(async () => json(rows));
    const geocoder = createGeocoder(
      { ...nominatim, email: 'me@example.com' },
      { fetch: fetchSpy, minIntervalMs: 0 },
    );
    const results = await geocoder.search('Zürich', { limit: 3, bias: [8.5, 47.4] });
    const url = new URL((fetchSpy.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin + url.pathname).toBe('https://nominatim.example/search');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      format: 'jsonv2',
      q: 'Zürich',
      limit: '3',
      email: 'me@example.com',
      viewbox: '7.5,48.4,9.5,46.4',
    });
    expect(results).toEqual([
      { label: 'Zürich, Switzerland', lng: 8.541, lat: 47.3744, bbox: [8.45, 47.32, 8.63, 47.43] },
      { label: 'No box', lng: 2, lat: 1 },
    ]);
  });

  it('ignores very short queries without asking the server', async () => {
    const fetchSpy = vi.fn(async () => json(rows));
    const geocoder = createGeocoder(nominatim, { fetch: fetchSpy, minIntervalMs: 0 });
    expect(await geocoder.search(' z ')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('caches results, ignoring case and spacing, and forgets the oldest after 100', async () => {
    const fetchSpy = vi.fn(async () => json(rows));
    const geocoder = createGeocoder(nominatim, { fetch: fetchSpy, minIntervalMs: 0 });
    await geocoder.search('Zürich');
    await geocoder.search('  zürich ');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 100; i++) await geocoder.search(`place ${i}`);
    await geocoder.search('Zürich');
    expect(fetchSpy).toHaveBeenCalledTimes(102);
  });

  it('queues requests at one per interval', async () => {
    let clock = 0;
    const times: number[] = [];
    const geocoder = createGeocoder(nominatim, {
      fetch: async () => {
        times.push(clock);
        return json(rows);
      },
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    await Promise.all([geocoder.search('aa'), geocoder.search('bb'), geocoder.search('cc')]);
    expect(times).toEqual([0, 1000, 2000]);
  });

  it('reverse geocodes and caches the answer, also when there is none', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(json({ display_name: 'Bahnhofstrasse 1, Zürich' }))
      .mockResolvedValueOnce(json({ error: 'Unable to geocode' }));
    const geocoder = createGeocoder(nominatim, { fetch: fetchSpy, minIntervalMs: 0 });
    expect(await geocoder.reverse(8.54, 47.37)).toEqual({ label: 'Bahnhofstrasse 1, Zürich' });
    expect(await geocoder.reverse(8.54, 47.37)).toEqual({ label: 'Bahnhofstrasse 1, Zürich' });
    expect(await geocoder.reverse(0, 0)).toBeNull();
    expect(await geocoder.reverse(0, 0)).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const url = new URL(fetchSpy.mock.calls[0]?.[0] as string);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      lat: '47.37',
      lon: '8.54',
      zoom: '18',
    });
  });

  it('reports rate limiting and server errors', async () => {
    const geocoder = createGeocoder(nominatim, {
      fetch: vi.fn().mockResolvedValueOnce(json({}, 429)).mockResolvedValueOnce(json({}, 500)),
      minIntervalMs: 0,
    });
    await expect(geocoder.search('aaa')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(geocoder.search('bbb')).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('does not cache a failed search', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json(rows));
    const geocoder = createGeocoder(nominatim, { fetch: fetchSpy, minIntervalMs: 0 });
    await expect(geocoder.search('Zürich')).rejects.toBeDefined();
    expect(await geocoder.search('Zürich')).toHaveLength(2);
  });

  it('returns nothing for a body it does not understand', async () => {
    const geocoder = createGeocoder(nominatim, {
      fetch: async () => json({ surprise: true }),
      minIntervalMs: 0,
    });
    expect(await geocoder.search('whatever')).toEqual([]);
  });

  it('passes the abort signal on to fetch', async () => {
    const fetchSpy = vi.fn(async () => json(rows));
    const geocoder = createGeocoder(nominatim, { fetch: fetchSpy, minIntervalMs: 0 });
    const controller = new AbortController();
    await geocoder.search('Zürich', { signal: controller.signal });
    expect((fetchSpy.mock.calls[0] as unknown as [string, { signal: AbortSignal }])[1].signal).toBe(
      controller.signal,
    );
  });
});

describe('MapTiler geocoder', () => {
  it('searches and reverses through the documented endpoints', async () => {
    const fetchSpy = vi.fn(async (url: string) =>
      json(
        url.includes('Z%C3%BCrich')
          ? {
              features: [
                {
                  place_name: 'Zürich, Switzerland',
                  center: [8.54, 47.37],
                  bbox: [8.4, 47.3, 8.7, 47.5],
                },
              ],
            }
          : { features: [{ place_name: 'Somewhere' }] },
      ),
    );
    const geocoder = createGeocoder({ type: 'maptiler', apiKey: 'k e y' }, { fetch: fetchSpy });
    const found = await geocoder.search('Zürich', { bias: [8, 47] });
    expect(found).toEqual([
      { label: 'Zürich, Switzerland', lng: 8.54, lat: 47.37, bbox: [8.4, 47.3, 8.7, 47.5] },
    ]);
    const searchUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(searchUrl).toContain('/geocoding/Z%C3%BCrich.json');
    expect(searchUrl).toContain('key=k%20e%20y');
    expect(searchUrl).toContain('proximity=8,47');
    expect(await geocoder.reverse(8.54, 47.37)).toEqual({ label: 'Somewhere' });
    expect(fetchSpy.mock.calls[1]?.[0]).toContain('/geocoding/8.54,47.37.json');
  });

  it('is not rate limited', async () => {
    let slept = 0;
    const geocoder = createGeocoder(
      { type: 'maptiler', apiKey: 'k' },
      {
        fetch: async () => json({ features: [] }),
        sleep: async (ms) => {
          slept += ms;
        },
      },
    );
    await Promise.all([geocoder.search('aa'), geocoder.search('bb')]);
    expect(slept).toBe(0);
  });
});

describe('geocoder: none', () => {
  it('finds nothing', async () => {
    const geocoder = createGeocoder({ type: 'none' });
    expect(await geocoder.search('anything')).toEqual([]);
    expect(await geocoder.reverse(1, 2)).toBeNull();
  });
});
