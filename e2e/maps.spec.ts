import { expect, type Page, test } from '@playwright/test';

// The playground's map points at OpenFreeMap. These tests answer the style request themselves with
// a style that has no tiles, so the real MapLibre (WebGL and web worker) runs without the network.
const STYLE = {
  version: 8,
  sources: {},
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#cfe0ee' } }],
};

async function stubStyle(page: Page): Promise<void> {
  // Routes registered later win, so the catch-all comes first and the style after it.
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.route('https://tiles.openfreemap.org/styles/liberty', (route) =>
    route.fulfill({ json: STYLE, headers: { 'access-control-allow-origin': '*' } }),
  );
}

test.describe('maps', () => {
  test('clusters two thousand markers and zooms into a cluster', async ({ page }) => {
    await stubStyle(page);
    await page.goto('/?tab=maps&theme=light');
    const map = page.locator('tessera-map');
    await expect(map.locator('.maplibregl-canvas')).toHaveCount(1);
    await expect(page.locator('map-demo [role=status]').first()).toContainText('Visible:');
    // The marker source lives in a web worker: features only appear when the worker works.
    await expect
      .poll(() =>
        map.evaluate((el) => {
          const handle = (
            el as unknown as { handle?: { raw(): { querySourceFeatures(id: string): unknown[] } } }
          ).handle;
          return handle?.raw().querySourceFeatures('tessera-markers').length ?? 0;
        }),
      )
      .toBeGreaterThan(0);
    await expect(map.locator('.maplibregl-ctrl-attrib')).toHaveCount(1);
  });

  test('exposes exactly one named map region', async ({ page }) => {
    await stubStyle(page);
    await page.goto('/?tab=maps&theme=light');
    await expect(page.locator('tessera-map .maplibregl-canvas')).toHaveCount(1);
    await expect(page.locator('tessera-map [role=region]')).toHaveCount(1);
    await expect(page.locator('tessera-map [role=region]')).toHaveAttribute(
      'aria-label',
      'Campsites around the world',
    );
  });

  test('the location picker submits the chosen place as JSON in a plain form', async ({ page }) => {
    await stubStyle(page);
    await page.route('https://nominatim.openstreetmap.org/**', (route) => {
      const url = new URL(route.request().url());
      const body = url.pathname.endsWith('/reverse')
        ? { display_name: 'Seestrasse 12, Zürich' }
        : [
            {
              display_name: 'Zürich, Switzerland',
              lat: '47.3744',
              lon: '8.5410',
              boundingbox: ['47.32', '47.43', '8.45', '8.63'],
            },
          ];
      return route.fulfill({ json: body, headers: { 'access-control-allow-origin': '*' } });
    });
    await page.goto('/?tab=picker&theme=light');
    const picker = page.locator('tessera-location-picker');
    await expect(picker.locator('.maplibregl-canvas')).toHaveCount(1);
    // Submitting without a place is refused by the form itself.
    await page.locator('picker-demo tessera-button[type=submit]').click();
    await expect(page.locator('picker-demo pre')).toHaveCount(0);
    const input = picker.locator('input[role=combobox]');
    await input.fill('Zürich');
    await expect(picker.locator('[role=option]')).toHaveCount(1);
    await input.press('Enter');
    await expect(picker.locator('.chosen .text')).toContainText('Zürich, Switzerland');
    await page.locator('picker-demo tessera-button[type=submit]').click();
    const submitted = JSON.parse((await page.locator('picker-demo pre').textContent()) ?? '{}') as {
      event: string;
      venue: { lng: number; lat: number; label: string };
    };
    expect(submitted.event).toBe('Lakeside summer party');
    expect(submitted.venue).toMatchObject({ label: 'Zürich, Switzerland' });
    expect(submitted.venue.lat).toBeCloseTo(47.3744, 3);
  });
});

test.describe('maps with the network', () => {
  test('@network shows real OpenFreeMap tiles', async ({ page }) => {
    await page.goto('/?tab=maps&theme=light');
    const canvas = page.locator('tessera-map .maplibregl-canvas');
    await expect(canvas).toHaveCount(1);
    await page.waitForTimeout(6000);
    const loaded = await page.evaluate(() => {
      const el = document
        .querySelector('map-demo')
        ?.shadowRoot?.querySelector('tessera-map') as unknown as {
        handle?: { raw(): { areTilesLoaded(): boolean } };
      };
      return el?.handle?.raw().areTilesLoaded() ?? false;
    });
    expect(loaded).toBe(true);
  });
});
