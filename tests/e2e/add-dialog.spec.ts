import { expect, test } from '@playwright/test';

for (const duplicateResponse of ['torrent-duplicate', 'duplicate torrent']) {
  test(`adding six transfers silently skips an existing seed (${duplicateResponse})`, async ({
    page,
  }) => {
    const rows = [{ id: 1, hashString: '1'.repeat(40), name: 'Existing seed', status: 6 }];
    let additions = 0;
    await page.route('**/rpc', async (route) => {
      const body = route.request().postDataJSON();
      let args = {};
      if (body.method === 'session-get') args = { version: '4.0.6', 'rpc-version': 17 };
      if (body.method === 'torrent-get') args = { torrents: rows };
      if (body.method === 'torrent-add') {
        additions++;
        const hash = body.arguments.filename.split(':').at(-1);
        const existing = rows.find((row) => row.hashString === hash);
        if (existing) {
          if (duplicateResponse === 'duplicate torrent') {
            await route.fulfill({ json: { result: duplicateResponse, tag: body.tag } });
            return;
          }
          args = { 'torrent-duplicate': existing };
        } else {
          const row = { id: rows.length + 1, hashString: hash, name: hash, status: 0 };
          rows.push(row);
          args = { 'torrent-added': row };
        }
      }
      await route.fulfill({ json: { result: 'success', arguments: args, tag: body.tag } });
    });
    await page.goto('/?lang=en');
    await page.getByLabel('Username', { exact: true }).fill('demo');
    await page.getByRole('button', { name: 'Enter workspace', exact: true }).click();
    await page
      .locator('.toolbar')
      .getByRole('button', { name: 'Add transfer', exact: true })
      .click();
    await page
      .getByPlaceholder('One link per line')
      .fill(
        [1, 2, 3, 4, 5, 6].map((id) => `magnet:?xt=urn:btih:${String(id).repeat(40)}`).join('\n'),
      );
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Add transfer', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-torrent-id]')).toHaveCount(6);
    await expect(page.getByText('Already exists', { exact: false })).toHaveCount(0);
    expect(additions).toBe(6);
    expect(rows.filter((row) => row.status === 0)).toHaveLength(5);
    expect(rows[0].status).toBe(6);
  });
}

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
