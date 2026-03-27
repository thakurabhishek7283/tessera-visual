import { expect, type Page, test } from '@playwright/test';

const open = async (page: Page, tab: string, extra = ''): Promise<void> => {
  await page.goto(`/?tab=${tab}&theme=light${extra}`);
  await page
    .locator(`tessera-${tab === 'whiteboard' ? 'whiteboard' : 'annotator'} .canvas svg`)
    .waitFor();
};

const canvas = (page: Page, tag = 'tessera-annotator') => page.locator(`${tag} .canvas svg`);

async function drag(
  page: Page,
  tag: string,
  from: [number, number],
  to: [number, number],
): Promise<void> {
  const box = (await canvas(page, tag).boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const p = (f: [number, number]): [number, number] => [
    box.x + box.width * f[0],
    box.y + box.height * f[1],
  ];
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 3 });
  await page.mouse.move(x2, y2, { steps: 3 });
  await page.mouse.up();
}

test.describe('annotator', () => {
  test('shows the toolbar with its icons and the image', async ({ page }) => {
    await open(page, 'annotator');
    await expect(page.locator('tessera-annotator .canvas svg image')).toHaveCount(1);
    // Every tool button has a drawn icon: a bundler once dropped their registration.
    const icons = page.locator('tessera-annotator-toolbar [data-tool] tessera-icon svg');
    expect(await icons.count()).toBeGreaterThan(5);
    for (const svg of await icons.all())
      expect(await svg.locator('> *').count()).toBeGreaterThan(0);
  });

  test('draws a rectangle, lists it, and it is still there after a reload', async ({ page }) => {
    await open(page, 'annotator');
    await page.locator('tessera-annotator-toolbar [data-tool=rect]').click();
    await drag(page, 'tessera-annotator', [0.3, 0.3], [0.5, 0.5]);
    const rows = page.locator('tessera-annotation-list .row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Rectangle at');
    // Give the debounced save time to reach IndexedDB.
    await page.waitForTimeout(900);
    await page.reload();
    await page.locator('tessera-annotator .canvas svg').waitFor();
    await expect(page.locator('tessera-annotation-list .row')).toHaveCount(1);
    await expect(page.locator('tessera-annotator .canvas svg .shapes rect')).toHaveCount(1);
  });

  test('labels a shape from the details panel and exports it as W3C JSON', async ({ page }) => {
    await open(page, 'annotator', '&image=floor-plan');
    await page.locator('tessera-annotator-toolbar [data-tool=ellipse]').click();
    await drag(page, 'tessera-annotator', [0.2, 0.2], [0.4, 0.4]);
    const label = page.locator('tessera-annotation-list input[type=text]').first();
    await label.fill('fire pit');
    await label.dispatchEvent('change');
    await expect(page.locator('tessera-annotation-list .row .name').first()).toHaveText('fire pit');
    await page.locator('annotate-demo summary').click();
    const json = await page.locator('annotate-demo pre').textContent();
    const list = JSON.parse(json ?? '[]') as Array<{
      body: Array<{ value: string }>;
      target: { selector: { type: string; value: string } };
    }>;
    expect(list).toHaveLength(1);
    expect(list[0]?.body[0]?.value).toBe('fire pit');
    expect(list[0]?.target.selector.type).toBe('SvgSelector');
    expect(list[0]?.target.selector.value).toContain('<ellipse');
  });

  test('undo and redo with the keyboard', async ({ page }) => {
    await open(page, 'annotator');
    await page.locator('tessera-annotator-toolbar [data-tool=rect]').click();
    await drag(page, 'tessera-annotator', [0.3, 0.3], [0.5, 0.5]);
    await expect(page.locator('tessera-annotation-list .row')).toHaveCount(1);
    await page.locator('tessera-annotator .canvas').focus();
    await page.keyboard.press('Control+z');
    await expect(page.locator('tessera-annotation-list .row')).toHaveCount(0);
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('tessera-annotation-list .row')).toHaveCount(1);
  });

  test('a second tab sees what the first one draws, without a server', async ({ browser }) => {
    const context = await browser.newContext();
    const a = await context.newPage();
    const b = await context.newPage();
    await open(a, 'annotator', '&user=alice');
    await open(b, 'annotator', '&user=bob');
    await a.locator('tessera-annotator-toolbar [data-tool=ellipse]').click();
    await drag(a, 'tessera-annotator', [0.3, 0.4], [0.5, 0.6]);
    await expect(b.locator('tessera-annotation-list .row')).toHaveCount(1, { timeout: 8000 });
    await context.close();
  });

  test('the whiteboard draws freehand strokes with the chosen colour', async ({ page }) => {
    await open(page, 'whiteboard');
    await page.locator('tessera-whiteboard [data-color=red]').click();
    await page.locator('tessera-whiteboard [data-tool=freehand]').click();
    const box = (await canvas(page, 'tessera-whiteboard').boundingBox()) as {
      x: number;
      y: number;
    };
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    for (let i = 0; i < 30; i++)
      await page.mouse.move(box.x + 200 + i * 8, box.y + 200 + Math.sin(i / 3) * 30);
    await page.mouse.up();
    const path = page.locator('tessera-whiteboard .canvas svg .shapes path');
    await expect(path).toHaveCount(1);
    expect(await path.evaluate((el) => (el as SVGPathElement).style.fill)).toContain(
      '--tessera-annotator-red',
    );
    await expect(page.locator('tessera-whiteboard .canvas svg .background pattern')).toHaveCount(1);
  });
});
