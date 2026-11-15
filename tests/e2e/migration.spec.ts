import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('legacy migration preserves old keys, backs up raw input and survives UI reset/reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('fixture-initialized')) return;
    localStorage.setItem(
      'transmission-web-control.system',
      JSON.stringify({
        labels: [{ name: 'Keep local label', color: '#112233', description: 'legacy description' }],
        labelMaps: { ['a'.repeat(40)]: [0] },
      }),
    );
    localStorage.setItem('transmission-web-control', '{malformed-user-json');
    localStorage.setItem('dictionary.folders', '/data/one\n/data/two');
    localStorage.setItem('fixture-initialized', '1');
  });
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        result: 'success',
        arguments:
          body.method === 'session-get'
            ? { version: '4.0.6', 'rpc-version': 17 }
            : body.method === 'torrent-get'
              ? { torrents: [] }
              : {},
        tag: body.tag,
      },
    });
  });
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.n-tabs-tab').getByText('Local data', { exact: true }).click();
  await page.getByRole('button', { name: 'Review legacy migration', exact: true }).click();
  await page.getByRole('button', { name: 'Import local data', exact: true }).click();
  await expect(page.locator('.sidebar')).toContainText('Keep local label');
  await page.getByRole('button', { name: 'Import backups', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const download = await downloadEvent,
    backup = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(backup.raw.originalStorage['transmission-web-control']).toBe('{malformed-user-json');
  expect(backup.raw.system.labels[0].description).toBe('legacy description');
  await page.locator('.n-tabs-tab').getByText('Appearance', { exact: true }).click();
  await page.getByRole('button', { name: 'Reset display preferences', exact: true }).click();
  await page.reload();
  await expect(page.locator('.sidebar')).toContainText('Keep local label');
  expect(await page.evaluate(() => localStorage.getItem('transmission-web-control'))).toBe(
    '{malformed-user-json',
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.n-tabs-tab').getByText('Local data', { exact: true }).click();
  await expect(page.locator('textarea').first()).toHaveValue('/data/one\n/data/two');
});
