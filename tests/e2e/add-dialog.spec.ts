import { expect, test } from '@playwright/test';

test('add dialog uses a custom picker and selectable server directories', async ({ page }) => {
  const additions: Record<string, unknown>[] = [];
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'torrent-add') additions.push(body.arguments);
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? {
                version: '4.1.4',
                'rpc-version': 19,
                'download-dir': '/downloads',
                'config-dir': '/config',
              }
            : body.method === 'torrent-get'
              ? {
                  torrents: [
                    {
                      id: 1,
                      hashString: 'a'.repeat(40),
                      name: 'Example',
                      status: 0,
                      downloadDir: '/volume1/Movies',
                    },
                  ],
                }
              : body.method === 'torrent-add'
                ? { 'torrent-added': { id: 2, name: 'New', hashString: 'b'.repeat(40) } }
                : {},
      },
    });
  });
  await page.goto('/?lang=zh-CN');
  await page.getByLabel('用户名', { exact: true }).fill('demo');
  await page.getByRole('button', { name: '切换到深色模式' }).click();
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.locator('.workspace')).toBeVisible();
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  const dialog = page.locator('.medium-dialog');
  await expect(dialog.locator('.add-dialog-content')).toBeFocused();
  await expect(page.locator('.n-auto-complete-menu')).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: '保存目录' })).not.toBeFocused();
  const picker = dialog.locator('input[type=file]');
  await expect(picker).toBeHidden();
  const chooser = page.waitForEvent('filechooser');
  await dialog.locator('.torrent-upload').click();
  await (
    await chooser
  ).setFiles({
    name: 'example.torrent',
    mimeType: 'application/x-bittorrent',
    buffer: Buffer.from('fixture'),
  });
  await expect(dialog.locator('.torrent-file')).toContainText('example.torrent');
  await dialog.getByRole('button', { name: '移除 example.torrent' }).click();
  await picker.setInputFiles({
    name: 'example.torrent',
    mimeType: 'application/x-bittorrent',
    buffer: Buffer.from('fixture'),
  });
  await expect(dialog.locator('.torrent-file')).toHaveCount(1);
  const directory = dialog.getByRole('textbox', { name: '保存目录' });
  await directory.click();
  await page.locator('.n-auto-complete-menu').getByText('/volume1/Movies', { exact: true }).click();
  await expect(directory).toHaveValue('/volume1/Movies');
  await page.screenshot({ path: 'artifacts/add-dialog-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: 'artifacts/add-dialog-mobile.png' });
  await dialog.getByRole('button', { name: '移除 example.torrent' }).click();
  await directory.fill('/volume1/Custom');
  await dialog.locator('textarea').fill(`magnet:?xt=urn:btih:${'b'.repeat(40)}`);
  await dialog.getByRole('button', { name: '添加任务', exact: true }).click();
  await expect.poll(() => additions.length).toBe(1);
  expect(additions[0]['download-dir']).toBe('/volume1/Custom');
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  for (let opening = 0; opening < 2; opening++) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.locator('.settings-dialog-heading')).toBeFocused();
    await expect(page.locator('.n-auto-complete-menu')).toHaveCount(0);
    await expect(page.locator('#setting-download-dir')).not.toBeFocused();
    await page.locator('#setting-download-dir').click();
    await expect(page.locator('.n-auto-complete-menu')).toBeVisible();
    await page.locator('.settings-dialog-heading').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.settings-dialog')).toHaveCount(0);
  }
});
