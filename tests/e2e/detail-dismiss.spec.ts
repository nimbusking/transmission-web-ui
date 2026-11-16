import { expect, test } from '@playwright/test';
const bits = Buffer.alloc(512);
for (let i = 0; i < 4096; i++)
  if (i < 1024 || (i < 3072 && i % 8 < 4)) bits[i >> 3] |= 128 >> (i % 8);
const encoded = bits.toString('base64');
test.beforeEach(async ({ page }) => {
  const rows = [1, 2].map((id) => ({
    id,
    hashString: String(id).repeat(40),
    name: `Task ${id}`,
    status: 0,
    downloadDir: '/data',
    totalSize: 67108864,
    percentDone: 0.5,
    trackers: [],
  }));
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON();
    const detail = b.arguments?.fields?.includes('pieces');
    await route.fulfill({
      json: {
        result: 'success',
        tag: b.tag,
        arguments:
          b.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : b.method === 'torrent-get'
              ? {
                  torrents: (Array.isArray(b.arguments.ids)
                    ? rows.filter((x) => b.arguments.ids.includes(x.id))
                    : rows
                  ).map((row) => ({
                    ...row,
                    ...(detail
                      ? {
                          pieceCount: 4096,
                          pieceSize: 16384,
                          pieces: encoded,
                          haveValid: 33554432,
                          haveUnchecked: 0,
                        }
                      : {}),
                  })),
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('[data-torrent-id="1"]')).toBeVisible();
});
test('blank click and explicit collapse close only details; normal controls preserve selection', async ({
  page,
}) => {
  await page.locator('[data-torrent-id="1"] .torrent-name').click();
  await expect(page.locator('.detail-header')).toContainText('Task 1');
  await page.locator('[data-torrent-id="2"]').getByRole('checkbox').click();
  await expect(page.locator('.detail-header')).toContainText('Task 1');
  await page.getByRole('button', { name: /^Name/ }).click();
  await expect(page.locator('.detail-region')).toBeVisible();
  await page.getByPlaceholder('Search names, separate keywords with spaces').click();
  await expect(page.locator('.detail-region')).toBeVisible();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.locator('.detail-region')).toBeVisible();
  await page.keyboard.press('Escape');
  await page
    .locator('.toolbar')
    .getByRole('button', { name: 'Transfer limits', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.detail-region')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  await expect(page.locator('.detail-region')).toBeVisible();
  await page.getByRole('button', { name: 'close', exact: true }).click();
  await page.locator('.detail-content').click({ position: { x: 20, y: 20 } });
  await expect(page.locator('.detail-region')).toBeVisible();
  const region = page.locator('.list-region'),
    box = await region.boundingBox();
  await region.click({ position: { x: box!.width / 2, y: box!.height - 20 } });
  await expect(page.locator('.detail-region')).toHaveCount(0);
  await expect(page.locator('[data-torrent-id="2"]').getByRole('checkbox')).toBeChecked();
  await page.locator('[data-torrent-id="1"] .torrent-name').click();
  await expect(page.locator('.detail-header')).toContainText('Task 1');
  await page.getByRole('button', { name: 'Collapse details', exact: true }).click();
  await expect(page.locator('.detail-region')).toHaveCount(0);
  await expect(page.locator('[data-torrent-id="2"]').getByRole('checkbox')).toBeChecked();
});
test('4096 pieces use one responsive 512-cell canvas with full, mixed and empty shades', async ({
  page,
}) => {
  await page.locator('[data-torrent-id="1"] .torrent-name').click();
  await expect(page.locator('.piece-map')).toHaveCount(1);
  await expect(page.locator('.piece-map-caption')).toContainText('4096 pieces shown in 512 cells');
  const pixels = await page.locator('.piece-map').evaluate((node: HTMLCanvasElement) => {
    const width = Math.floor(node.getBoundingClientRect().width),
      columns = Math.max(1, Math.floor((width + 4) / 22)),
      step = (width + 4) / columns,
      scale = node.width / width;
    return {
      width,
      height: node.getBoundingClientRect().height,
      colors: [0, 200, 500].map((index) =>
        Array.from(
          node
            .getContext('2d')!
            .getImageData(
              Math.floor(((index % columns) * step + 5) * scale),
              Math.floor((Math.floor(index / columns) * step + 5) * scale),
              1,
              1,
            ).data,
        ),
      ),
    };
  });
  expect(pixels.width).toBeGreaterThan(512);
  expect(pixels.height).toBeGreaterThan(64);
  expect(pixels.colors.map((x) => x[3])).toEqual([255, 255, 255]);
  expect(pixels.colors[0][0]).toBeLessThan(pixels.colors[1][0]);
  expect(pixels.colors[1][0]).toBeLessThan(pixels.colors[2][0]);
});
