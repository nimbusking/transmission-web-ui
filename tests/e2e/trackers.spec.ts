import { expect, test } from '@playwright/test';
test('bulk Tracker preview is read-only; conflicts settle per task without overwriting external edits', async ({
  page,
}) => {
  const writes: any[] = [],
    rows = [1, 2].map((id) => ({
      id,
      hashString: String(id).repeat(40),
      name: `Tracker ${id}`,
      status: 0,
      downloadDir: '/data',
      trackers: [{ id: 0, announce: 'http://tracker.old/announce', tier: 0 }],
    }));
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'torrent-set') writes.push(body);
    const ids = body.arguments.ids;
    const args =
      body.method === 'session-get'
        ? { version: '4.0.6', 'rpc-version': 17 }
        : body.method === 'torrent-get'
          ? {
              torrents: Array.isArray(ids)
                ? rows.filter((row) => ids.includes(row.id) || ids.includes(row.hashString))
                : rows,
            }
          : {};
    await route.fulfill({ json: { result: 'success', arguments: args, tag: body.tag } });
  });
  await page.goto('/?lang=en');
  await page.getByRole('checkbox', { name: 'Select current page', exact: true }).check();
  async function preview() {
    await page.getByRole('button', { name: 'More ▾', exact: true }).click();
    await page
      .locator('.n-dropdown-menu')
      .getByText('Replace trackers in bulk', { exact: true })
      .click();
    await page.getByRole('textbox', { name: /^Match URL text/ }).fill('tracker.old');
    await page.getByRole('textbox', { name: /^Replacement text/ }).fill('tracker.new');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.locator('.import-preview')).toHaveCount(2);
  }
  await preview();
  expect(writes).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.n-modal')).toHaveCount(0);
  expect(writes).toEqual([]);
  await preview();
  rows[1].trackers[0].announce = 'http://external-change/announce';
  await page.getByRole('button', { name: /^Apply \(2\)$/ }).click();
  await expect(page.locator('.n-alert')).toContainText('Tracker list changed');
  expect(writes).toHaveLength(1);
  expect(writes[0].arguments).toEqual({
    ids: ['1'.repeat(40)],
    trackerList: 'http://tracker.new/announce',
  });
});
