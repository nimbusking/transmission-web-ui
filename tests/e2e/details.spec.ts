import { expect, test } from '@playwright/test';
test('10000 files stay virtual and filtering preserves original RPC indexes', async ({ page }) => {
  const commands: any[] = [],
    files = Array.from({ length: 10000 }, (_, index) => ({
      name: `folder/file-${String(index).padStart(5, '0')}.bin`,
      length: 10,
      bytesCompleted: 0,
    }));
  const base = {
    id: 1,
    hashString: 'a'.repeat(40),
    name: 'Large file list',
    downloadDir: '/data',
    status: 0,
  };
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'torrent-set') commands.push(body);
    const args =
      body.method === 'session-get'
        ? { version: '4.0.6', 'rpc-version': 17 }
        : body.method === 'torrent-get'
          ? {
              torrents: [
                {
                  ...base,
                  ...(body.arguments.fields.includes('files')
                    ? {
                        files,
                        fileStats: files.map(() => ({
                          wanted: true,
                          priority: 0,
                          bytesCompleted: 0,
                        })),
                      }
                    : {}),
                },
              ],
            }
          : {};
    await route.fulfill({ json: { result: 'success', arguments: args, tag: body.tag } });
  });
  await page.goto('/?lang=en');
  await page.locator('[data-torrent-id="1"] .torrent-name').click();
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await expect(page.locator('.detail-content')).toContainText('file-00000.bin');
  expect(await page.locator('.detail-content .n-data-table-tr').count()).toBeLessThan(100);
  await page.getByPlaceholder('Filter file paths').fill('file-09999');
  const row = page
    .locator('.detail-content .n-data-table-tr')
    .filter({ hasText: 'file-09999.bin' });
  await row.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Skip selected files', exact: true }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0].arguments).toEqual({ ids: ['a'.repeat(40)], 'files-unwanted': [9999] });
  await page.locator('.detail-header').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.detail-content')).toHaveCount(0);
});
test('failed configuration save retains the draft and never writes another task', async ({
  page,
}) => {
  const writes: any[] = [],
    rows = [1, 2].map((id) => ({
      id,
      hashString: String(id).repeat(40),
      name: `Draft ${id}`,
      downloadDir: '/data',
      status: 0,
    }));
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'torrent-set') {
      writes.push(body);
      await route.fulfill({ json: { result: 'save refused', tag: body.tag } });
      return;
    }
    const args =
      body.method === 'session-get'
        ? { version: '4.0.6', 'rpc-version': 17 }
        : body.method === 'torrent-get'
          ? {
              torrents: (Array.isArray(body.arguments.ids)
                ? rows.filter((row) => body.arguments.ids.includes(row.id))
                : rows
              ).map((row) => ({
                ...row,
                ...(body.arguments.fields.includes('downloadLimit')
                  ? { downloadLimit: row.id * 100, downloadLimited: true }
                  : {}),
              })),
            }
          : {};
    await route.fulfill({ json: { result: 'success', arguments: args, tag: body.tag } });
  });
  await page.goto('/?lang=en');
  await page.locator('[data-torrent-id="1"] .torrent-name').click();
  await page.getByRole('tab', { name: 'Configuration', exact: true }).click();
  const input = page
    .locator('.config-grid label')
    .filter({ hasText: 'Download limit (KB/s)' })
    .getByRole('textbox');
  await expect(input).toHaveValue('100');
  await input.fill('333');
  await input.blur();
  await page.locator('.detail-content').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.detail-pane')).toContainText('save refused');
  await expect(input).toHaveValue('333');
  expect(writes[0].arguments.ids).toEqual(['1'.repeat(40)]);
  await page.locator('[data-torrent-id="2"] .torrent-name').click();
  await expect(input).toHaveValue('200');
  expect(writes).toHaveLength(1);
});
test('late successful save cannot clear another task draft', async ({ page }) => {
  const rows = [1, 2].map((id) => ({
      id,
      hashString: String(id).repeat(40),
      name: `Late ${id}`,
      downloadDir: '/data',
      status: 0,
    })),
    limits: Record<number, number> = { 1: 100, 2: 200 };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'torrent-set') {
      if (body.arguments.ids[0] === '1'.repeat(40)) await gate;
      limits[Number(body.arguments.ids[0][0])] = body.arguments.downloadLimit;
    }
    const args =
      body.method === 'session-get'
        ? { version: '4.0.6', 'rpc-version': 17 }
        : body.method === 'torrent-get'
          ? {
              torrents: (Array.isArray(body.arguments.ids)
                ? rows.filter((row) => body.arguments.ids.includes(row.id))
                : rows
              ).map((row) => ({
                ...row,
                ...(body.arguments.fields.includes('downloadLimit')
                  ? { downloadLimit: limits[row.id], downloadLimited: true }
                  : {}),
              })),
            }
          : {};
    await route.fulfill({ json: { result: 'success', arguments: args, tag: body.tag } });
  });
  await page.goto('/?lang=en');
  await page.locator('[data-torrent-id="1"] .torrent-name').click();
  await page.getByRole('tab', { name: 'Configuration', exact: true }).click();
  const input = page
    .locator('.config-grid label')
    .filter({ hasText: 'Download limit (KB/s)' })
    .getByRole('textbox');
  await input.fill('333');
  await input.blur();
  await page.locator('.detail-content').getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-torrent-id="2"] .torrent-name').click();
  await expect(input).toHaveValue('200');
  await input.fill('444');
  await input.blur();
  release();
  await expect(
    page.locator('.detail-content').getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled();
  await expect(input).toHaveValue('444');
  expect(limits[2]).toBe(200);
});
