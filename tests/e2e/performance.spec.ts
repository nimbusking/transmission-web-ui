import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
test('real 5000 tasks render and filter', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium CDP heap sample');
  test.skip(
    process.env.TWUI_REAL_SCALE !== '1',
    'Seed isolated 19093 daemon with 5000 tasks, then set TWUI_REAL_SCALE=1',
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const start = performance.now();
  await page.goto('http://127.0.0.1:19093/transmission/web/?lang=en');
  await expect(page.locator('.section-title')).toContainText('5000 transfers');
  await expect(page.locator('[data-torrent-id]').first()).toBeVisible();
  const navigationToRowsMs = performance.now() - start;
  const names = await page.locator('[data-torrent-id] .torrent-name').allTextContents();
  expect(names.length).toBeGreaterThan(0);
  expect(names.length).toBeLessThan(100);
  const filterStart = performance.now();
  await page.getByPlaceholder('Search name, hash or directory').fill(names[0]);
  await expect(page.locator('.section-title')).toContainText('1 transfers');
  const filterIncludingDebounceAndAutomationMs = performance.now() - filterStart;
  await page.getByPlaceholder('Search name, hash or directory').clear();
  await expect(page.locator('.section-title')).toContainText('5000 transfers');
  const cdp = await page.context().newCDPSession(page);
  const heap = await cdp.send('Runtime.getHeapUsage');
  await page.screenshot({ path: 'artifacts/real-5000.png', fullPage: true });
  const result = {
    navigationToRowsMs,
    filterIncludingDebounceAndAutomationMs,
    usedHeapBytes: heap.usedSize,
    renderedRows: names.length,
    errors,
    scope: 'single Chromium smoke sample; not P95 or 30-minute budget certification',
  };
  await writeFile('artifacts/real-5000-browser.json', JSON.stringify(result, null, 2));
  expect(errors).toEqual([]);
});
