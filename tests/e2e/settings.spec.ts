import { expect, test } from '@playwright/test';
async function mock(page: import('@playwright/test').Page, writes: any[]) {
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'session-set') writes.push(body.arguments);
    await route.fulfill({
      json: {
        result: 'success',
        arguments:
          body.method === 'session-get'
            ? {
                version: '4.0.6',
                'rpc-version': 17,
                'download-dir': writes.at(-1)?.['download-dir'] ?? '/old',
                'peer-port': 51413,
              }
            : body.method === 'torrent-get'
              ? { torrents: [] }
              : {},
        tag: body.tag,
      },
    });
  });
}
test('local import broadcasts to another tab and daemon changes require separate confirmation', async ({
  page,
  context,
}) => {
  const writes: any[] = [];
  await mock(page, writes);
  await page.goto('/?lang=en');
  const other = await context.newPage();
  await mock(other, writes);
  await other.goto('/?lang=en');
  await page.bringToFront();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Import and export', exact: true }).click();
  const input = {
    configVersion: 1,
    system: { labels: [{ name: 'Shared label', color: '#123456' }], labelMaps: {} },
    'dictionary-folders': ['/keep'],
    server: { 'download-dir': '/imported', 'peer-port': 51413 },
  };
  await page.getByTestId('config-import').setInputFiles({
    name: 'mixed-config.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(input)),
  });
  await page.getByRole('button', { name: 'Import local data', exact: true }).click();
  await expect(page.locator('.import-preview')).toContainText('Labels: 1');
  await other.getByRole('button', { name: 'Settings', exact: true }).click();
  await other.locator('.n-tabs-tab').getByText('User labels', { exact: true }).click();
  await expect(other.getByPlaceholder('Label name', { exact: true })).toHaveValue('Shared label');
  expect(writes).toEqual([]);
  await page.getByRole('checkbox', { name: 'Transmission parameters', exact: true }).last().check();
  await page.getByRole('button', { name: /^Apply daemon changes/ }).click();
  await expect(page.locator('.diff-table')).toContainText('/old');
  await expect(page.locator('.diff-table')).toContainText('/imported');
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({ 'download-dir': '/imported' });
});
test('manual services recover after failure and are never requested at startup', async ({
  page,
}) => {
  let external = 0;
  const writes: any[] = [];
  await mock(page, writes);
  await page.route('https://raw.githubusercontent.com/**', async (route) => {
    external++;
    await route.fulfill(
      external === 1
        ? { status: 503, body: 'unavailable' }
        : { status: 200, body: 'http://local-tracker/announce' },
    );
  });
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.n-tabs-tab').getByText('Extra settings', { exact: true }).click();
  expect(external).toBe(0);
  await page.getByRole('button', { name: 'Load online tracker list', exact: true }).click();
  await expect(page.locator('.n-alert')).toContainText('HTTP 503');
  await page.getByRole('button', { name: 'Load online tracker list', exact: true }).click();
  await expect(page.locator('.text-result')).toContainText('http://local-tracker/announce');
  expect(external).toBe(2);
});
test('port and blocklist diagnostics expose failures and can be retried', async ({ page }) => {
  let portCalls = 0,
    blockCalls = 0;
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    let args = {};
    if (body.method === 'session-get')
      args = {
        version: '4.0.6',
        'rpc-version': 17,
        'download-dir': '/data',
        'peer-port': 51413,
        'blocklist-url': 'http://local/list',
        'blocklist-enabled': true,
      };
    if (body.method === 'torrent-get') args = { torrents: [] };
    if (body.method === 'port-test') {
      portCalls++;
      args = { 'port-is-open': false };
    }
    if (body.method === 'blocklist-update') {
      blockCalls++;
      if (blockCalls === 1) {
        await route.fulfill({ status: 503, body: 'unavailable' });
        return;
      }
      args = { 'blocklist-size': 1 };
    }
    await route.fulfill({ json: { result: 'success', arguments: args, tag: body.tag } });
  });
  await page.goto('/?lang=en');
  expect(portCalls + blockCalls).toBe(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.n-tabs-tab').getByText('Network', { exact: true }).click();
  await page.getByRole('button', { name: 'Test current port', exact: true }).click();
  await expect(page.locator('[data-setting="peer-port"]')).toContainText('The port is closed');
  await page.getByRole('button', { name: 'Update blocklist', exact: true }).click();
  await expect(page.locator('.n-alert')).toContainText('HTTP 503');
  await page.getByRole('button', { name: 'Update blocklist', exact: true }).click();
  await expect(page.locator('[data-setting="blocklist-url"]')).toContainText('Blocklist rules: 1');
  expect(portCalls).toBe(1);
  expect(blockCalls).toBe(2);
});
