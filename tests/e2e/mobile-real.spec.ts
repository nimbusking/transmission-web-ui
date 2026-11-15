import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { fixture } from '../fixtures/torrent.mjs';
for (const [port, version] of [
  [19093, '4.0.6'],
  [19095, '4.1.4'],
] as const)
  test(`mobile legacy entry preserves query and performs common actions on real ${version}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const name = `twui-mobile-${randomUUID()}`,
      data = fixture(name);
    await page.goto(`http://127.0.0.1:${port}/transmission/web/index.mobile.html?lang=en`);
    await expect(page).toHaveURL(/index\.html\?lang=en#\/torrents$/);
    await page.getByRole('button', { name: '＋ Add transfer', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles({
      name: 'mobile.torrent',
      mimeType: 'application/x-bittorrent',
      buffer: Buffer.from(data.metainfo, 'base64'),
    });
    await page.getByRole('button', { name: 'Add transfer', exact: true }).click();
    const row = page.locator('.mobile-transfer').filter({ hasText: name });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.locator('.detail-pane')).toContainText(name);
    await page.getByRole('button', { name: '▷ Start', exact: true }).click();
    await expect(row).toContainText('Downloading');
    await page.getByRole('button', { name: 'Ⅱ Pause', exact: true }).click();
    await expect(row).toContainText('Paused');
    await page.getByRole('button', { name: 'More ▾', exact: true }).click();
    await page.locator('.n-dropdown-menu').getByText('Verify data', { exact: true }).click();
    await expect(row).toContainText('Paused', { timeout: 10000 });
    await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(row).toHaveCount(0);
  });
