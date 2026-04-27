// Captures the README screenshots from the built playground. Usage: `pnpm screenshots`.
// Starts `vite preview` itself, so the playground must already be built (`pnpm build`).
// The map shots answer the style request themselves (a plain style, no tiles), so they need no network.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:4173/';
const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const out = (name) => new URL(`../docs/media/${name}.png`, import.meta.url).pathname;
mkdirSync(new URL('../docs/media/', import.meta.url), { recursive: true });

const server = spawn('pnpm', ['--filter', 'playground', 'preview'], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

const view = { width: 1280, height: 860 };
const STYLE = {
  version: 8,
  sources: {},
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dbe7f1' } }],
};

async function stubMap(page, scheme) {
  const style = {
    ...STYLE,
    layers: [
      {
        ...STYLE.layers[0],
        paint: { 'background-color': scheme === 'dark' ? '#1d2a3a' : '#dbe7f1' },
      },
    ],
  };
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.route('https://tiles.openfreemap.org/styles/liberty', (route) =>
    route.fulfill({ json: style, headers: { 'access-control-allow-origin': '*' } }),
  );
}

async function drag(page, tag, from, to, steps = 6) {
  const box = await page.locator(`${tag} .canvas svg`).boundingBox();
  const at = ([fx, fy]) => [box.x + box.width * fx, box.y + box.height * fy];
  const [x1, y1] = at(from);
  const [x2, y2] = at(to);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps });
  await page.mouse.move(x2, y2, { steps });
  await page.mouse.up();
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });

  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: view, colorScheme: scheme });
    const page = await context.newPage();
    const go = (tab, extra = '') => page.goto(`${base}?tab=${tab}&theme=${scheme}${extra}`);

    // ----- annotate -----
    await go('annotator');
    await page.locator('tessera-annotator .canvas svg').waitFor();
    await page.waitForTimeout(500);
    const tool = (id) => page.locator(`tessera-annotator-toolbar [data-tool=${id}]`).click();
    await tool('rect');
    await drag(page, 'tessera-annotator', [0.56, 0.38], [0.76, 0.56]);
    const name = page.locator('tessera-annotation-list input[type=text]').first();
    await name.fill('tent site');
    await name.dispatchEvent('change');
    await tool('ellipse');
    await drag(page, 'tessera-annotator', [0.52, 0.68], [0.66, 0.8]);
    await name.fill('fire pit');
    await name.dispatchEvent('change');
    await tool('arrow');
    await drag(page, 'tessera-annotator', [0.3, 0.14], [0.44, 0.3]);
    await tool('select');
    await page.locator('tessera-annotation-list .row').nth(1).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: out(`annotate-${scheme}`) });

    // ----- whiteboard -----
    await go('whiteboard');
    await page.locator('tessera-whiteboard .canvas svg').waitFor();
    await page.waitForTimeout(400);
    const wb = await page.locator('tessera-whiteboard .canvas svg').boundingBox();
    // A colour picked while a shape is selected recolours it, so deselect after each shape.
    const next = async (color, tool, from, to) => {
      await page.keyboard.press('Escape');
      await page.locator(`tessera-whiteboard [data-color=${color}]`).click();
      await page.locator(`tessera-whiteboard [data-tool=${tool}]`).click();
      await drag(page, 'tessera-whiteboard', from, to);
    };
    await next('blue', 'rect', [0.18, 0.2], [0.4, 0.42]);
    await next('red', 'ellipse', [0.5, 0.18], [0.68, 0.4]);
    await next('green', 'arrow', [0.4, 0.31], [0.5, 0.29]);
    await page.keyboard.press('Escape');
    await page.locator('tessera-whiteboard [data-color=ink]').click();
    await page.locator('tessera-whiteboard [data-tool=freehand]').click();
    await page.mouse.move(wb.x + wb.width * 0.2, wb.y + wb.height * 0.68);
    await page.mouse.down();
    for (let i = 0; i <= 50; i++) {
      await page.mouse.move(
        wb.x + wb.width * (0.2 + i * 0.012),
        wb.y + wb.height * (0.68 + Math.sin(i / 5) * 0.06),
      );
    }
    await page.mouse.up();
    await page.locator('tessera-whiteboard [data-tool=select]').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: out(`whiteboard-${scheme}`) });

    // ----- maps (blank style, so no network) -----
    await stubMap(page, scheme);
    await go('maps');
    await page.locator('tessera-map .maplibregl-canvas').waitFor();
    await page.locator('map-demo .readout').first().waitFor();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: out(`maps-${scheme}`) });

    // ----- location picker -----
    await page.route('https://nominatim.openstreetmap.org/**', (route) => {
      const reverse = new URL(route.request().url()).pathname.endsWith('/reverse');
      return route.fulfill({
        json: reverse
          ? { display_name: 'Seestrasse 12, 8002 Zürich, Switzerland' }
          : [
              {
                display_name: 'Zürich, Switzerland',
                lat: '47.3744',
                lon: '8.5410',
                boundingbox: ['47.32', '47.43', '8.45', '8.63'],
              },
            ],
        headers: { 'access-control-allow-origin': '*' },
      });
    });
    await go('picker');
    await page.locator('tessera-location-picker .maplibregl-canvas').waitFor();
    const input = page.locator('tessera-location-picker input[role=combobox]');
    await input.fill('Zürich');
    await page.locator('tessera-location-picker [role=option]').first().waitFor();
    await input.press('Enter');
    await page.locator('tessera-location-picker .chosen .text').waitFor();
    await page.waitForTimeout(900);
    await page.screenshot({ path: out(`picker-${scheme}`) });
    await context.close();
  }
  await browser.close();
} finally {
  stop();
}
