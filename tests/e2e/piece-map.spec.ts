import { expect, test, type Page } from '@playwright/test';
test.use({ deviceScaleFactor: 2 });
async function fixture(page: Page, count = 4096, totalSize = 67108864, bits?: Buffer) {
  const data = bits ?? Buffer.alloc(Math.ceil(count / 8));
  if (!bits)
    for (let i = 0; i < count; i++)
      if (i < 1024 || (i < 3072 && i % 8 < 4)) data[i >> 3] |= 128 >> (i % 8);
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : body.method === 'torrent-get'
              ? {
                  torrents: [
                    {
                      id: 1,
                      hashString: 'a'.repeat(40),
                      name: 'Piece preview',
                      status: 0,
                      downloadDir: '/data',
                      totalSize,
                      pieceSize: 16384,
                      pieceCount: count,
                      pieces: data.toString('base64'),
                      trackers: [],
                    },
                  ],
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  const row = page.locator('[data-torrent-id="1"] .torrent-name');
  if (page.viewportSize()!.width >= 768) await row.click();
  else await page.locator('.mobile-transfer').getByText('Piece preview', { exact: true }).click();
  await expect(page.locator('.piece-map')).toBeVisible();
  if (page.viewportSize()!.width >= 768) {
    const bar = (await page.locator('.detail-resizer').boundingBox())!;
    await page.mouse.move(bar.x + 20, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + 20, bar.y - 200);
    await page.mouse.up();
    await expect
      .poll(async () => (await page.locator('.detail-content').boundingBox())!.height)
      .toBeGreaterThan(400);
  }
}
async function cellPoint(page: Page, index: number) {
  const canvas = page.locator('.piece-map');
  await canvas.scrollIntoViewIfNeeded();
  // Let ResizeObserver, layout and the scroll event finish before firing the hover.
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return canvas.evaluate((el, i) => {
    const r = el.getBoundingClientRect(),
      width = Math.floor(r.width),
      columns = Math.max(1, Math.floor((width + 4) / 22)),
      step = (width + 4) / columns;
    return {
      x: r.left + (i % columns) * step + 6,
      y: r.top + Math.floor(i / columns) * step + 6,
      width,
      columns,
      step,
      top: r.top,
      left: r.left,
      height: r.height,
    };
  }, index);
}
test('full-width larger squares expose accurate hover values and clear gaps, scroll and resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await fixture(page);
  const tooltip = page.locator('.piece-cell-tooltip'),
    canvas = page.locator('.piece-map');
  const initial = await cellPoint(page, 0);
  const content = await page.locator('.detail-content').boundingBox();
  expect(initial.width).toBeGreaterThan(1000);
  expect(initial.left).toBeCloseTo(content!.x, 0);
  expect(initial.width).toBeGreaterThan(content!.width - 20);
  expect(initial.step - 4).toBeGreaterThanOrEqual(18);
  for (const [index, percentage, range] of [
    [0, '100.00%', '1–8'],
    [200, '50.00%', '1601–1608'],
    [500, '0.00%', '4001–4008'],
  ] as const) {
    const point = await cellPoint(page, index);
    await page.mouse.move(point.x, point.y);
    await expect(tooltip).toContainText(`128.0 KiB × ${percentage}`);
    await expect(tooltip).toContainText(`Pieces ${range}`);
    await expect(page.locator('.detail-header')).toContainText('Piece preview');
  }
  const first = await cellPoint(page, 0);
  await page.mouse.move(first.left + first.step - 2, first.top + 6);
  await expect(tooltip).toBeHidden();
  // The unoccupied cells of the final row must not claim to represent a piece.
  const unused = await cellPoint(page, 512);
  await page.mouse.move(unused.x, unused.y);
  await expect(tooltip).toBeHidden();
  const middle = await cellPoint(page, 200);
  await page.mouse.move(middle.x, middle.y);
  await expect(tooltip).toContainText('50.00%');
  await page.setViewportSize({ width: 1100, height: 1200 });
  await expect(tooltip).toBeHidden();
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeLessThan(initial.width);
  const resized = await cellPoint(page, 200);
  await page.mouse.move(resized.x, resized.y);
  await expect(tooltip).toContainText('128.0 KiB × 50.00%');
  const box = (await page.locator('.detail-content').boundingBox())!;
  await page.mouse.move(box.x + box.width - 30, box.y + 30);
  await page.mouse.wheel(0, -1200);
  await expect(tooltip).toBeHidden();
  await canvas.scrollIntoViewIfNeeded();
  await page.mouse.move(20, 20);
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await canvas.focus();
  await expect(tooltip).toContainText('Pieces 1–8');
  await page.keyboard.press('ArrowRight');
  await expect(tooltip).toContainText('Pieces 9–16');
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await page.getByRole('button', { name: 'Collapse details', exact: true }).click();
  await expect(tooltip).toHaveCount(0);
});
test('short final piece uses real byte length on narrow screens and does not stretch few pieces', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, 3, 36864, Buffer.from([0b01100000]));
  const first = await cellPoint(page, 0),
    tooltip = page.locator('.piece-cell-tooltip');
  expect(first.step - 4).toBeGreaterThanOrEqual(18);
  expect(first.step - 4).toBeLessThan(22);
  expect(first.left + first.width).toBeLessThanOrEqual(390);
  const last = await cellPoint(page, 2);
  await page.mouse.move(last.x, last.y);
  await expect(tooltip).toContainText('4.0 KiB × 100.00%');
  await expect(tooltip).toContainText('Pieces 3–3');
  const empty = await cellPoint(page, 3);
  await page.mouse.move(empty.x, empty.y);
  await expect(tooltip).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('last aggregate cell accounts for a shorter completed tail piece', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const bits = Buffer.alloc(65);
  bits[64] = 128;
  await fixture(page, 513, 512 * 16384 + 4096, bits);
  const last = await cellPoint(page, 511);
  await page.mouse.move(last.x, last.y);
  await expect(page.locator('.piece-cell-tooltip')).toContainText('20.0 KiB × 20.00%');
  await expect(page.locator('.piece-cell-tooltip')).toContainText('Pieces 512–513');
});
