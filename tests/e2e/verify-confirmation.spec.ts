import { expect, test, type Page } from '@playwright/test';
async function fixture(page: Page, mode: 'success' | 'failed' | 'network' = 'success') {
  const rows = [1, 2].map((id) => ({
    id,
    hashString: String(id).repeat(40),
    name: `Verify ${id}`,
    downloadDir: '/data',
    status: 0,
    percentDone: 0.5,
    recheckProgress: 0,
    trackers: [],
  }));
  const writes: any[] = [];
  await page.route('**/app-config.json', (r) =>
    r.fulfill({ json: { rpcUrl: '../rpc', refreshIntervalMs: 2000 } }),
  );
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON();
    if (b.method === 'torrent-verify') {
      writes.push(b);
      if (mode === 'network') {
        await route.abort();
        return;
      }
      if (mode === 'failed' && b.arguments.ids[0] === '2'.repeat(40)) {
        await route.fulfill({ json: { result: 'verification rejected', tag: b.tag } });
        return;
      }
      const row = rows.find((r) => b.arguments.ids.includes(r.hashString));
      if (row) {
        row.status = 2;
        row.recheckProgress = 0.25;
      }
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
  await expect(page.locator('[data-torrent-id="1"]')).toBeVisible();
  return { rows, writes };
}
const confirm = (page: Page) =>
  page.getByRole('button', { name: 'Start verification', exact: true });
test('toolbar and context confirm before writes; cancel, Escape, close and mask are read-only', async ({
  page,
}) => {
  const { writes } = await fixture(page);
  await page.locator('[data-torrent-id="1"]').getByRole('checkbox').check();
  for (const entry of ['toolbar', 'escape', 'context', 'mask']) {
    if (entry === 'context') {
      await page.locator('[data-torrent-id="2"]').click({ button: 'right' });
      await page.locator('.n-dropdown-menu').getByText('Verify data', { exact: true }).click();
    } else
      await page
        .locator('.toolbar')
        .getByRole('button', { name: 'Verify data', exact: true })
        .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.target-list')).toHaveText(
      entry === 'context' ? 'Verify 2' : 'Verify 1',
    );
    await expect(dialog).toContainText('disk I/O');
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    expect(writes).toHaveLength(0);
    if (entry === 'toolbar')
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    if (entry === 'escape') await page.keyboard.press('Escape');
    if (entry === 'context')
      await dialog.getByRole('button', { name: 'close', exact: true }).click();
    if (entry === 'mask') await page.mouse.click(5, 5);
    await expect(dialog).toHaveCount(0);
    expect(writes).toHaveLength(0);
  }
});
test('confirmed toolbar and right-click keep explicit hash scope and report submission, not completion', async ({
  page,
}) => {
  const { writes } = await fixture(page);
  await page.locator('[data-torrent-id="2"] .torrent-name').click();
  await page.locator('[data-torrent-id="1"]').getByRole('checkbox').check();
  await page.locator('.toolbar').getByRole('button', { name: 'Verify data', exact: true }).click();
  await expect(page.locator('.target-list')).toHaveText('Verify 1');
  expect(writes).toHaveLength(0);
  await confirm(page).dblclick();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes.map((b) => b.arguments)).toEqual([{ ids: ['1'.repeat(40)] }]);
  await expect(page.locator('.n-message')).toContainText('request submitted');
  await expect(page.locator('[data-torrent-id="1"] .progress-cell')).toHaveAttribute(
    'aria-valuenow',
    '25',
  );
  await expect(page.locator('[data-torrent-id="1"] .progress-cell')).toHaveAttribute(
    'aria-valuetext',
    'Verification 25.00%',
  );
  await page.locator('[data-torrent-id="2"]').click({ button: 'right' });
  await page.locator('.n-dropdown-menu').getByText('Verify data', { exact: true }).click();
  await expect(page.locator('.target-list')).toHaveText('Verify 2');
  await confirm(page).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].arguments).toEqual({ ids: ['2'.repeat(40)] });
});
test('identity change during confirmation rejects verification without sending a command', async ({
  page,
}) => {
  const { rows, writes } = await fixture(page);
  await page.locator('[data-torrent-id="1"]').getByRole('checkbox').check();
  await page.locator('.toolbar').getByRole('button', { name: 'Verify data', exact: true }).click();
  rows[0].hashString = 'a'.repeat(40);
  rows[0].name = 'Replaced identity';
  await expect(page.locator('[data-torrent-id="1"] .torrent-name')).toHaveText('Replaced identity');
  await confirm(page).click();
  await expect(page.getByRole('dialog')).toContainText('Task identity changed');
  await expect(confirm(page)).toBeDisabled();
  expect(writes).toHaveLength(0);
});
for (const mode of ['failed', 'network'] as const)
  test(`${mode}: failed or unknown verification retains errors without retrying accepted targets`, async ({
    page,
  }) => {
    const { writes } = await fixture(page, mode);
    await page.getByRole('checkbox', { name: 'Select current page', exact: true }).check();
    await page
      .locator('.toolbar')
      .getByRole('button', { name: 'Verify data', exact: true })
      .click();
    expect(writes).toHaveLength(0);
    await confirm(page).click();
    await expect(page.getByRole('dialog')).toContainText(
      mode === 'failed' ? 'verification rejected' : 'Unknown',
    );
    await expect(page.getByRole('dialog')).toContainText('will not resubmit this batch');
    await expect(confirm(page)).toBeDisabled();
    expect(writes.map((b) => b.arguments.ids)).toEqual([['1'.repeat(40)], ['2'.repeat(40)]]);
    await page.keyboard.press('Enter');
    expect(writes).toHaveLength(2);
  });
