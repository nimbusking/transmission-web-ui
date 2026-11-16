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
  await page.locator('.detail-header').getByRole('button', { name: 'Collapse details' }).click();
  await expect(page.locator('.detail-content')).toHaveCount(0);
});
test('task configuration tab is removed and remaining details issue no config reads or writes', async ({
  page,
}) => {
  const calls: any[] = [];
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19, 'download-dir': '/data' }
            : body.method === 'torrent-get'
              ? {
                  torrents: [
                    {
                      id: 1,
                      hashString: '1'.repeat(40),
                      name: 'Details without config',
                      downloadDir: '/data',
                      status: 0,
                      files: [],
                      fileStats: [],
                      trackers: [],
                      trackerStats: [],
                      peers: [],
                    },
                  ],
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await page.locator('[data-torrent-id="1"] .torrent-name').click();
  await expect(page.getByRole('tab')).toHaveText(['Overview', 'Files', 'Servers', 'Peers']);
  for (const name of ['Files', 'Servers', 'Peers', 'Overview'])
    await page.getByRole('tab', { name, exact: true }).click();
  await expect(page.locator('.config-grid')).toHaveCount(0);
  expect(
    calls.every((call) =>
      ['session-get', 'session-stats', 'torrent-get', 'free-space'].includes(call.method),
    ),
  ).toBe(true);
  expect(
    calls
      .filter((call) => call.method === 'torrent-get')
      .every(
        (call) =>
          !call.arguments.fields.includes('downloadLimit') &&
          !call.arguments.fields.includes('seedIdleMode'),
      ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.locator('.settings-dialog');
  await expect(settings.locator('.n-tabs-tab')).toHaveText([
    'Basic settings',
    'Network',
    'Bandwidth limits',
    'Schedule',
    'Folder dictionary',
    'Extra settings',
    'User labels',
  ]);
  await settings.locator('.n-tabs-tab').getByText('Basic settings', { exact: true }).click();
  await expect(settings.locator('[data-setting="download-dir"] input')).toHaveValue('/data');
  await expect(settings.locator('[data-setting="download-dir"] input')).toBeEnabled();
  await expect(
    settings.getByRole('button', { name: 'Save Transmission parameters', exact: true }),
  ).toBeDisabled();
  expect(
    calls.filter((call) => call.method === 'torrent-set' || call.method === 'session-set'),
  ).toHaveLength(0);
});
