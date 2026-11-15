import { expect, test } from '@playwright/test';
test('column order, visibility, pointer width and continuous mode persist by field key', async ({
  page,
}) => {
  const rows = Array.from({ length: 500 }, (_, id) => ({
    id,
    hashString: id.toString(16).padStart(40, '0'),
    name: `Layout ${id}`,
    downloadDir: '/data',
    status: 0,
  }));
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        result: 'success',
        arguments:
          body.method === 'session-get'
            ? { version: '4.0.6', 'rpc-version': 17 }
            : body.method === 'torrent-get'
              ? { torrents: rows }
              : {},
        tag: body.tag,
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('[data-torrent-id="0"]')).toBeVisible();
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  await page
    .locator('.column-setting')
    .filter({ has: page.getByRole('checkbox', { name: 'Total size', exact: true }) })
    .getByRole('button', { name: '↑', exact: true })
    .click();
  await page
    .locator('.column-setting')
    .getByRole('checkbox', { name: 'Upload', exact: true })
    .click();
  await expect(
    page.locator('.column-setting').getByRole('checkbox', { name: 'Upload', exact: true }),
  ).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.locator('.n-modal-mask')).toBeHidden();
  await expect(page.locator('.column-settings-dialog')).toBeHidden();
  await expect(page.locator('.column-sort').first()).toHaveText('Total size');
  await expect(page.locator('.column-sort').filter({ hasText: /^Upload$/ })).toHaveCount(0);
  const separator = page.getByRole('separator', { name: 'Width Name', exact: true }),
    box = (await separator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2);
  await page.mouse.up();
  const savedWidth = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const open = indexedDB.open('transmission-web-ui', 2);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result,
              request = db
                .transaction('data')
                .objectStore('data')
                .get(`${location.origin}/rpc:settings`);
            request.onsuccess = () => {
              resolve(request.result.ui.columns.find((column: any) => column.key === 'name').width);
              db.close();
            };
          };
        }),
    );
  await expect.poll(savedWidth).toBe(380);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Pagination', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Pagination', exact: true })).not.toBeChecked();
  await page.reload();
  await expect(page.locator('.column-sort').first()).toHaveText('Total size');
  await expect(page.locator('.column-sort').filter({ hasText: /^Upload$/ })).toHaveCount(0);
  await expect(page.locator('.list-footer .n-pagination')).toHaveCount(0);
  expect(await savedWidth()).toBe(380);
  expect(await page.locator('[data-torrent-id]').count()).toBeLessThan(100);
});
