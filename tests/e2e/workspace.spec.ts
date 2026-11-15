import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { fixture } from '../fixtures/torrent.mjs';
test('5000 tasks: renders, filters, sorts and preserves safe text', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(baseURL!)) external.push(r.url());
  });
  const rows = Array.from({ length: 5000 }, (_, id) => ({
    id,
    hashString: id.toString(16).padStart(40, '0'),
    name: id === 0 ? '<img src=x onerror=alert(1)>' : `Transfer ${String(id).padStart(4, '0')}`,
    downloadDir: '/data',
    status: 0,
    totalSize: 1024,
    percentDone: 0.5,
    queuePosition: id,
    trackers: [],
    error: 0,
  }));
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    const args =
      body.method === 'session-get'
        ? { version: '4.0.6', 'rpc-version': 17, 'session-id': 'test' }
        : body.method === 'torrent-get'
          ? { torrents: rows }
          : {};
    await route.fulfill({ json: { result: 'success', arguments: args, tag: body.tag } });
  });
  await page.goto('/?lang=en');
  await expect(page.getByText('5000 transfers').first()).toBeVisible();
  await expect(page.locator('[data-torrent-id="0"]')).toContainText('<img src=x onerror=alert(1)>');
  expect(await page.locator('[data-torrent-id]').count()).toBeLessThan(100);
  await page.getByPlaceholder('Search name, hash or directory').fill('Transfer 4999');
  await expect(page.getByText('1 transfers').first()).toBeVisible();
  await expect(page.locator('[data-torrent-id="4999"]')).toBeVisible();
  await page.getByPlaceholder('Search name, hash or directory').clear();
  await expect(page.getByText('5000 transfers').first()).toBeVisible();
  await page.getByRole('button', { name: /^Name/ }).click();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
for (const port of [19091, 19092, 19093, 19095])
  test(`real daemon ${port}: static application connects`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/transmission/web/?lang=en`);
    await expect(page.locator('.connection')).toContainText('Connected');
    const name = `twui-browser-${port}-${randomUUID()}`,
      data = fixture(name);
    await page
      .locator('.toolbar')
      .getByRole('button', { name: 'Add transfer', exact: true })
      .click();
    await page.locator('input[type=file]').setInputFiles({
      name: `${name}.torrent`,
      mimeType: 'application/x-bittorrent',
      buffer: Buffer.from(data.metainfo, 'base64'),
    });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Add transfer', exact: true })
      .click();
    const row = page.locator('[data-torrent-id]').filter({ hasText: name });
    await expect(row).toBeVisible();
    await row.click();
    await row.getByRole('checkbox').check();
    await expect(page.locator('.detail-header')).toContainText(name);
    await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(row).toHaveCount(0);
    expect(errors).toEqual([]);
  });
