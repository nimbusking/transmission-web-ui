import { expect, test, type Page } from '@playwright/test';
async function fixture(page: Page) {
  const calls: any[] = [];
  const rows = [1, 2].map((id) => ({
    id,
    hashString: String(id).repeat(40),
    name: `Toolbar ${id}`,
    downloadDir: '/data',
    status: 0,
    percentDone: 0.5,
    trackers: [],
  }));
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON();
    calls.push(b);
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
  return calls;
}
for (const theme of ['light', 'dark'] as const)
  test(`${theme}: full-width single toolbar and reachable narrow-screen controls`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    const calls = await fixture(page);
    const toolbar = page.getByRole('navigation', { name: 'Task toolbar' });
    const geometry = () =>
      toolbar.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const header = document.querySelector('.topbar')!.getBoundingClientRect();
        const sidebar = document.querySelector('.sidebar')!.getBoundingClientRect();
        const main = document.querySelector('.main-panel')!.getBoundingClientRect();
        return {
          x: rect.x,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          headerBottom: header.bottom,
          sidebarTop: sidebar.top,
          mainTop: main.top,
          width: window.innerWidth,
          height: rect.height,
          scroll: node.scrollWidth > node.clientWidth,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          overflowY: getComputedStyle(node).overflowY,
        };
      });
    for (const width of [1440, 1024, 800, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const g = await geometry();
      expect(g.x).toBe(0);
      expect(g.right).toBe(g.width);
      expect(g.top).toBe(g.headerBottom);
      expect(g.height).toBe(48);
      expect(g.overflowY).toBe('hidden');
      expect(g.mainTop).toBe(g.bottom);
      expect(g.overflow).toBe(false);
      if (width >= 768) expect(g.sidebarTop).toBe(g.bottom);
      if (width === 1440) expect(g.scroll).toBe(false);
      if (width === 390) expect(g.scroll).toBe(true);
      const add = await toolbar
        .getByRole('button', { name: 'Add transfer', exact: true })
        .boundingBox();
      const columns = toolbar.getByRole('button', { name: 'Columns', exact: true });
      await toolbar.getByRole('button', { name: 'Add transfer', exact: true }).focus();
      await columns.focus();
      const box = (await columns.boundingBox())!;
      expect(box.y).toBe(add!.y);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/?lang=en&devicetype=computer');
    await expect(page.locator('.workspace')).toHaveClass(/force-desktop/);
    expect((await geometry()).overflow).toBe(false);
    await expect(page.locator('.main-panel .toolbar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(1);
    expect(
      calls.filter((b) => !['session-get', 'torrent-get', 'session-stats'].includes(b.method)),
    ).toEqual([]);
  });
test('shortcuts preserve checked targets, dialogs, queues and detail selection', async ({
  page,
}) => {
  const calls = await fixture(page);
  const toolbar = page.getByRole('navigation', { name: 'Task toolbar' });
  const button = (name: string) => toolbar.getByRole('button', { name, exact: true });
  await expect(button('Start')).toBeDisabled();
  await expect(button('Rename')).toBeDisabled();
  await page.locator('[data-torrent-id="2"] .torrent-name').click();
  await expect(page.locator('.detail-header')).toContainText('Toolbar 2');
  for (const name of [
    'Start',
    'Pause',
    'Rename',
    'Remove',
    'Verify data',
    'Ask tracker for peers',
    'Change location',
    'Transfer limits',
    'Queue',
  ])
    await expect(button(name)).toBeDisabled();
  await page.locator('[data-torrent-id="1"]').getByRole('checkbox').check();
  for (const [name, method] of [
    ['Start', 'torrent-start'],
    ['Pause', 'torrent-stop'],
    ['Verify data', 'torrent-verify'],
    ['Ask tracker for peers', 'torrent-reannounce'],
  ]) {
    await button(name).click();
    if (method === 'torrent-verify') {
      expect(calls.filter((b) => b.method === method)).toHaveLength(0);
      await page.getByRole('button', { name: 'Start verification', exact: true }).click();
    }
    await expect.poll(() => calls.filter((b) => b.method === method).length).toBe(1);
    expect(calls.find((b) => b.method === method).arguments.ids).toEqual(['1'.repeat(40)]);
    await expect(page.locator('.detail-header')).toContainText('Toolbar 2');
  }
  await page.locator('[data-torrent-id="2"]').getByRole('checkbox').check();
  await expect(button('Rename')).toBeDisabled();
  await page.locator('[data-torrent-id="2"]').getByRole('checkbox').uncheck();
  for (const name of ['Rename', 'Remove', 'Change location', 'Transfer limits']) {
    await button(name).click();
    await expect(page.getByRole('dialog')).toContainText('Toolbar 1');
    await expect(page.locator('.target-list')).not.toContainText('Toolbar 2');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  await button('Queue').click();
  await page.locator('.n-dropdown-menu').getByText('Move to top', { exact: true }).click();
  await expect.poll(() => calls.filter((b) => b.method === 'queue-move-top').length).toBe(1);
  expect(calls.find((b) => b.method === 'queue-move-top').arguments.ids).toEqual(['1'.repeat(40)]);
  await button('More').click();
  await expect(page.locator('.n-dropdown-menu')).toContainText('Replace trackers');
  await page.keyboard.press('Escape');
  await button('Settings').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await button('Add transfer').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.detail-header')).toContainText('Toolbar 2');
  await expect(page.locator('[data-torrent-id="1"]').getByRole('checkbox')).toBeChecked();
});
test('refresh controls share persisted settings and issue no daemon writes', async ({ page }) => {
  const calls = await fixture(page);
  const toolbar = page.getByRole('navigation', { name: 'Task toolbar' });
  const interval = toolbar.getByRole('textbox', {
    name: 'Refresh interval (seconds)',
    exact: true,
  });
  await interval.fill('7');
  await interval.press('Tab');
  await expect(interval).toHaveValue('7');
  await toolbar.getByRole('checkbox', { name: 'Automatic refresh', exact: true }).click();
  await expect(
    toolbar.getByRole('checkbox', { name: 'Automatic refresh', exact: true }),
  ).not.toBeChecked();
  await expect(interval).toBeDisabled();
  const before = calls.filter((b) => b.method === 'torrent-get').length;
  await toolbar.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect
    .poll(() => calls.filter((b) => b.method === 'torrent-get').length)
    .toBeGreaterThan(before);
  await page.reload();
  await expect(
    toolbar.getByRole('checkbox', { name: 'Automatic refresh', exact: true }),
  ).not.toBeChecked();
  await expect(interval).toHaveValue('7');
  await toolbar.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('checkbox', { name: 'Automatic refresh', exact: true }),
  ).not.toBeChecked();
  await expect(
    page
      .getByRole('dialog')
      .getByText('Refresh interval (milliseconds)', { exact: false })
      .locator('input'),
  ).toHaveValue('7000');
  await page.keyboard.press('Escape');
  expect(
    calls.filter((b) => !['session-get', 'torrent-get', 'session-stats'].includes(b.method)),
  ).toEqual([]);
});

test('only checkbox selections enable toolbar; clearing checks never falls back to highlighted detail', async ({
  page,
}) => {
  const calls = await fixture(page);
  const toolbar = page.getByRole('navigation', { name: 'Task toolbar' });
  const taskNames = [
    'Start',
    'Pause',
    'Rename',
    'Remove',
    'Verify data',
    'Ask tracker for peers',
    'Change location',
    'Transfer limits',
    'Queue',
  ];
  const disabled = async () => {
    for (const name of taskNames)
      await expect(toolbar.getByRole('button', { name, exact: true })).toBeDisabled();
  };
  await page.locator('[data-torrent-id="2"] .torrent-name').click();
  await expect(page.locator('[data-torrent-id="2"]')).toHaveClass(/selected-row/);
  await expect(page.locator('.detail-header')).toContainText('Toolbar 2');
  await disabled();
  for (const name of ['Add transfer', 'Settings', 'Columns'])
    await expect(toolbar.getByRole('button', { name, exact: true })).toBeEnabled();
  const check = page.locator('[data-torrent-id="1"]').getByRole('checkbox');
  await check.check();
  await expect(toolbar.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
  await check.uncheck();
  await disabled();
  await expect(page.locator('.detail-header')).toContainText('Toolbar 2');
  const all = page.getByRole('checkbox', { name: 'Select current page', exact: true });
  await all.check();
  await expect(toolbar.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
  await expect(toolbar.getByRole('button', { name: 'Rename', exact: true })).toBeDisabled();
  await all.uncheck();
  await disabled();
  await check.check();
  await page.getByPlaceholder('Search names, separate keywords with spaces').fill('Toolbar 2');
  await expect(page.locator('[data-torrent-id="1"]')).toHaveCount(0);
  await disabled();
  await expect(page.locator('.detail-header')).toContainText('Toolbar 2');
  expect(
    calls.filter((b) => !['session-get', 'session-stats', 'torrent-get'].includes(b.method)),
  ).toEqual([]);
});
