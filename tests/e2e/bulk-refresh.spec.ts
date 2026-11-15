import { expect, test, type Page } from '@playwright/test';
async function fixture(page: Page, empty = false, reject = false) {
  const row = (id: number) => ({
    id,
    hashString: String(id).repeat(40),
    name: `Bulk ${id}`,
    downloadDir: '/data',
    status: 0,
    trackers: [{ id: 0, announce: 'http://tracker.old/announce', tier: 0 }],
  });
  const rows = empty ? [] : [row(1), row(2)];
  const writes: any[] = [];
  let lists = 0;
  await page.route('**/app-config.json', (r) =>
    r.fulfill({ json: { rpcUrl: '../rpc', refreshIntervalMs: 2000 } }),
  );
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON();
    if (b.method === 'torrent-get') lists++;
    if (!['torrent-get', 'session-get', 'session-stats'].includes(b.method)) writes.push(b);
    if (reject && b.method === 'torrent-stop' && b.arguments.ids[0] === '2'.repeat(40)) {
      await route.fulfill({ json: { result: 'stop rejected', tag: b.tag } });
      return;
    }
    await route.fulfill({
      json: {
        result: 'success',
        tag: b.tag,
        arguments:
          b.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : b.method === 'torrent-get'
              ? {
                  torrents: Array.isArray(b.arguments.ids)
                    ? rows.filter(
                        (r) =>
                          b.arguments.ids.includes(r.id) || b.arguments.ids.includes(r.hashString),
                      )
                    : rows,
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('.connection')).toContainText('Connected');
  if (!empty) await expect(page.locator('[data-torrent-id="1"]')).toBeVisible();
  return { rows, row, writes, lists: () => lists };
}
const more = (page: Page) =>
  page.locator('.toolbar').getByRole('button', { name: 'More', exact: true });
const pick = async (page: Page, name: string) => {
  await more(page).click();
  await page.locator('.n-dropdown-menu').getByText(name, { exact: true }).click();
};
test('More has only three bulk actions; global scope ignores search and freezes all task hashes before confirmation', async ({
  page,
}) => {
  const { rows, row, writes } = await fixture(page);
  await more(page).click();
  await expect(page.locator('.n-dropdown-option-body__label')).toHaveText([
    'Pause all',
    'Start all',
    'Replace trackers in bulk',
  ]);
  const trackerItem = page
    .locator('.n-dropdown-option-body')
    .filter({ hasText: 'Replace trackers in bulk' });
  await expect(trackerItem).toHaveClass(/--disabled/);
  await trackerItem.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('Search name, hash or directory').fill('Bulk 1');
  await expect(page.locator('[data-torrent-id="2"]')).toHaveCount(0);
  rows.push(row(3));
  await pick(page, 'Pause all');
  await expect(page.locator('.target-list')).toContainText('Bulk 3');
  await expect(page.getByRole('dialog')).toContainText('entire current connection');
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  expect(writes).toHaveLength(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await pick(page, 'Start all');
  await expect(page.locator('.target-list div')).toHaveCount(3);
  rows.push(row(4));
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes.map((b) => b.arguments.ids[0]).sort()).toEqual(
    [1, 2, 3].map((id) => String(id).repeat(40)),
  );
  expect(writes.every((b) => b.method === 'torrent-start' && b.arguments.ids.length === 1)).toBe(
    true,
  );
  await pick(page, 'Pause all');
  await expect(page.locator('.target-list div')).toHaveCount(4);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    writes
      .filter((b) => b.method === 'torrent-stop')
      .map((b) => b.arguments.ids[0])
      .sort(),
  ).toEqual([1, 2, 3, 4].map((id) => String(id).repeat(40)));
});
test('empty list disables More; partial global failure stays visible without resubmitting the entire batch', async ({
  page,
}) => {
  const { writes } = await fixture(page, false, true);
  await pick(page, 'Pause all');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('stop rejected');
  await expect(page.getByRole('dialog')).toContainText('will not resubmit');
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }),
  ).toBeDisabled();
  expect(writes).toHaveLength(2);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.unroute('**/rpc');
  await page.route('**/rpc', (r) => {
    const b = r.request().postDataJSON();
    return r.fulfill({
      json: {
        result: 'success',
        tag: b.tag,
        arguments:
          b.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : b.method === 'torrent-get'
              ? { torrents: [] }
              : {},
      },
    });
  });
  await page.reload();
  await expect(page.locator('.connection')).toContainText('Connected');
  await expect(more(page)).toBeDisabled();
});
test('Tracker bulk replacement still previews only explicitly checked tasks', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.locator('[data-torrent-id="2"]').getByRole('checkbox').check();
  await pick(page, 'Replace trackers in bulk');
  await page.getByRole('textbox', { name: /^Match URL text/ }).fill('tracker.old');
  await page.getByRole('textbox', { name: /^Replacement text/ }).fill('tracker.new');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.import-preview')).toHaveCount(1);
  await expect(page.locator('.import-preview')).toContainText('Bulk 2');
  expect(writes).toHaveLength(0);
  await page.keyboard.press('Escape');
});
test('automatic refresh really sends periodic reads, stops when off and preserves disabled interval controls', async ({
  page,
}) => {
  const state = await fixture(page);
  const toolbar = page.locator('.toolbar'),
    toggle = toolbar.getByRole('checkbox', { name: 'Automatic refresh', exact: true }),
    interval = toolbar.getByRole('textbox', { name: 'Refresh interval (seconds)', exact: true });
  const first = state.lists();
  await expect.poll(state.lists, { timeout: 6000 }).toBeGreaterThan(first);
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(interval).toBeDisabled();
  await expect(page.locator('.toolbar-refresh .n-input-number button')).toHaveCount(2);
  for (const button of await page.locator('.toolbar-refresh .n-input-number button').all())
    await expect(button).toBeDisabled();
  const stopped = state.lists();
  await page.waitForTimeout(2400);
  expect(state.lists()).toBe(stopped);
  await toolbar.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(state.lists).toBe(stopped + 1);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(interval).toBeEnabled();
  await expect.poll(state.lists, { timeout: 6000 }).toBeGreaterThan(stopped + 1);
  await interval.fill('4');
  await interval.press('Tab');
  await expect(interval).toHaveValue('4');
  await toggle.click();
  await expect(interval).toBeDisabled();
  await page.reload();
  await expect(interval).toHaveValue('4');
  await expect(interval).toBeDisabled();
  await expect(toggle).not.toBeChecked();
  await toolbar.getByRole('button', { name: 'Settings', exact: true }).click();
  const settingsInterval = page
    .getByRole('dialog')
    .getByText('Refresh interval (milliseconds)', { exact: false })
    .locator('input');
  await expect(settingsInterval).toBeDisabled();
  await expect(settingsInterval).toHaveValue('4000');
  expect(state.writes).toHaveLength(0);
});
