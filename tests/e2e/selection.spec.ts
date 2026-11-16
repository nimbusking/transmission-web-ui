import { expect, test } from '@playwright/test';
test('checked scope, detail selection, sorted Shift range and context menu are independent', async ({
  page,
}) => {
  const commands: any[] = [];
  const rows = [3, 1, 2].map((id) => ({
    id,
    hashString: String(id).repeat(40),
    name: `Task ${id}`,
    downloadDir: '/data',
    status: 0,
    queuePosition: 3 - id,
    percentDone: 0,
  }));
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method.startsWith('torrent-') && body.method !== 'torrent-get') commands.push(body);
    const args =
      body.method === 'session-get'
        ? { version: '4.0.6', 'rpc-version': 17 }
        : body.method === 'torrent-get'
          ? {
              torrents:
                body.arguments.ids && Array.isArray(body.arguments.ids)
                  ? rows.filter((x) => body.arguments.ids.includes(x.id))
                  : rows,
            }
          : {};
    await route.fulfill({ json: { result: 'success', arguments: args, tag: body.tag } });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('[data-torrent-id="1"]')).toBeVisible();
  await page.getByRole('button', { name: /^Name/ }).click();
  await page.locator('[data-torrent-id="1"]').getByRole('checkbox').click();
  await page
    .locator('[data-torrent-id="3"]')
    .getByRole('checkbox')
    .click({ modifiers: ['Shift'] });
  await expect(page.locator('.list-footer')).toContainText('3 selected');
  await page.locator('[data-torrent-id="2"] .torrent-name').click();
  await expect(page.locator('.detail-header')).toContainText('Task 2');
  await expect(page.locator('.list-footer')).toContainText('3 selected');
  await page.locator('[data-torrent-id="2"]').click({ button: 'right' });
  await page.locator('.n-dropdown-menu').getByText('Pause', { exact: true }).click();
  await expect.poll(() => commands.filter((x) => x.method === 'torrent-stop').length).toBe(3);
  expect(
    commands
      .filter((x) => x.method === 'torrent-stop')
      .flatMap((x) => x.arguments.ids)
      .sort(),
  ).toEqual(rows.map((x) => x.hashString).sort());
  await page.getByPlaceholder('Search names, separate keywords with spaces').fill('Task 1');
  await expect(page.locator('.list-footer')).not.toContainText('selected');
  await page.locator('[data-torrent-id="1"]').click({ button: 'right' });
  await page.locator('.n-dropdown-menu').getByText('Pause', { exact: true }).click();
  await expect
    .poll(async () => ({
      count: commands.filter((x) => x.method === 'torrent-stop').length,
      messages: await page.locator('.n-message').allTextContents(),
    }))
    .toEqual({ count: 4, messages: [] });
  expect(commands.filter((x) => x.method === 'torrent-stop').at(-1).arguments.ids).toEqual([
    '1'.repeat(40),
  ]);
});
test('mobile layout exposes common task operations and details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        result: 'success',
        arguments:
          body.method === 'session-get'
            ? { version: '4.0.6', 'rpc-version': 17 }
            : body.method === 'torrent-get'
              ? {
                  torrents: [
                    {
                      id: 1,
                      hashString: 'a'.repeat(40),
                      name: 'Mobile transfer',
                      downloadDir: '/data',
                      status: 0,
                    },
                  ],
                }
              : {},
        tag: body.tag,
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('.mobile-transfer')).toContainText('Mobile transfer');
  await expect(page.locator('.desktop-table')).toBeHidden();
  await page.locator('.mobile-transfer').click();
  await expect(page.locator('.detail-header')).toContainText('Mobile transfer');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
  await page.locator('.mobile-transfer').getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
  await page.locator('.mobile-transfer').getByRole('checkbox').uncheck();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
  await page.locator('.detail-header').getByRole('button', { name: 'Collapse details' }).click();
  await expect(page.locator('.detail-pane')).toHaveCount(0);
});
