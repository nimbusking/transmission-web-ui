import { expect, test, type Page } from '@playwright/test';
async function fixture(page: Page) {
  const state = {
    files: Array.from({ length: 10000 }, (_, i) => ({
      name:
        i === 1
          ? 'docs/README.url'
          : i === 2
            ? '____padding_file/0'
            : i === 3
              ? 'RARBG_DO_NOT_MIRROR.exe'
              : `folder/file-${String(i).padStart(5, '0')}.bin`,
      length: i + 1,
      bytesCompleted: 0,
    })),
    reads: 0,
    writes: [] as any[],
    fail: false,
  };
  const rows = [1, 2].map((id) => ({
    id,
    hashString: String(id).repeat(40),
    name: id === 1 ? 'File panel' : 'Other files',
    status: 0,
    downloadDir: '/data',
  }));
  await page.route('**/app-config.json', (r) =>
    r.fulfill({ json: { rpcUrl: '../rpc', refreshIntervalMs: 300000 } }),
  );
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON(),
      isFiles = b.method === 'torrent-get' && b.arguments.fields.includes('files');
    if (isFiles) state.reads++;
    if (b.method === 'torrent-set') state.writes.push(b);
    if (isFiles && state.fail)
      return route.fulfill({ json: { tag: b.tag, result: 'file read rejected' } });
    const id = b.arguments.ids?.[0] ?? 1;
    const files = id === 2 ? [{ name: 'only.txt', length: 1, bytesCompleted: 1 }] : state.files;
    await route.fulfill({
      json: {
        result: 'success',
        tag: b.tag,
        arguments:
          b.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : b.method === 'torrent-get'
              ? {
                  torrents: isFiles
                    ? [
                        {
                          ...rows[id - 1],
                          files,
                          fileStats: files.map((file, index) => ({
                            bytesCompleted: Math.min(index, file.length),
                            wanted: true,
                            priority: 0,
                          })),
                        },
                      ]
                    : rows,
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await page.locator('[data-torrent-id="1"] .torrent-name').click();
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await expect(page.locator('.file-list-summary')).toContainText('10000 files');
  return state;
}
const summary = (page: Page) => page.locator('.file-list-summary');
async function pageNumber(page: Page, n: number) {
  const input = page.locator('.file-page-controls .n-pagination-quick-jumper input');
  await input.fill(String(n));
  await input.press('Enter');
  await expect(page.locator('.file-page-controls')).toContainText(`Page ${n} of`);
}
async function preset(page: Page, name: string) {
  await page.locator('.file-preset').click();
  await page
    .locator('.n-base-select-option')
    .filter({ hasText: new RegExp(`^${name}$`) })
    .click();
}
test('local pages clear checks and wanted/priority commands preserve original indices after paging and global sorting', async ({
  page,
}) => {
  const state = await fixture(page);
  await expect(summary(page)).toContainText('1–200');
  expect(await page.locator('.torrent-file-table .n-data-table-tr').count()).toBeLessThan(100);
  const reads = state.reads;
  await pageNumber(page, 2);
  await expect(summary(page)).toContainText('201–400');
  expect(state.reads).toBe(reads);
  const row = page
    .locator('.torrent-file-table .n-data-table-tr')
    .filter({ hasText: 'file-00200.bin' });
  await row.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Skip selected files', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].arguments).toEqual({ ids: ['1'.repeat(40)], 'files-unwanted': [200] });
  await page.getByRole('button', { name: 'Selected file priority', exact: true }).click();
  await page.getByText('High priority', { exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  expect(state.writes[1].arguments['priority-high']).toEqual([200]);
  await pageNumber(page, 3);
  await expect(summary(page)).toContainText('0 selected');
  await expect(
    page.getByRole('button', { name: 'Skip selected files', exact: true }),
  ).toBeDisabled();
  // Sort the entire 10,000-file source before paging, not just the current slice.
  const size = page.locator('.torrent-file-table th').filter({ hasText: 'Size' });
  await size.click();
  await expect(size.locator('.n-data-table-sorter')).toHaveClass(/--desc/);
  await expect(summary(page)).toContainText('1–200');
  const last = page
    .locator('.torrent-file-table .n-data-table-tr')
    .filter({ hasText: 'file-09999.bin' });
  await expect(last).toBeVisible();
  await last.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Download selected files', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(3);
  expect(state.writes[2].arguments['files-wanted']).toEqual([9999]);
});
test('templates, regex, counts and task switches keep filtering separate from mutation', async ({
  page,
}) => {
  const state = await fixture(page);
  await preset(page, 'BitComet padding files');
  await expect(summary(page)).toContainText('1 matching / 10000 files');
  await expect(page.locator('.torrent-file-table')).toContainText('____padding_file');
  await preset(page, 'Unnecessary files');
  await expect(summary(page)).toContainText('3 matching / 10000 files');
  expect(state.writes).toEqual([]);
  await preset(page, 'All files');
  const query = page.getByPlaceholder('Filter file paths');
  await query.fill('file-09999');
  await expect(summary(page)).toContainText('1 matching / 10000 files');
  await page
    .locator('.torrent-file-table .n-data-table-tr')
    .filter({ hasText: 'file-09999.bin' })
    .getByRole('checkbox')
    .click();
  await query.fill('not-present');
  await expect(summary(page)).toContainText('0–0');
  await expect(summary(page)).toContainText('0 selected');
  await page.getByRole('checkbox', { name: 'Regular expression', exact: true }).click();
  await query.fill('[');
  await expect(page.locator('.error-text')).toBeVisible();
  await query.fill('file-09999');
  await expect(page.locator('.error-text')).toHaveCount(0);
  await expect(summary(page)).toContainText('1 matching');
  await page.locator('[data-torrent-id="2"] .torrent-name').click();
  await expect(summary(page)).toContainText('1 matching / 1 files');
  await expect(query).toHaveValue('');
  expect(state.writes).toEqual([]);
});
test('file page size persists independently, 5000-row pages stay virtual and shrinking data clamps the page', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.locator('.file-page-controls .n-select').click();
  await page.locator('.n-base-select-option').filter({ hasText: '5000 / page' }).click();
  await expect(page.locator('.file-page-controls')).toContainText('Page 1 of 2');
  await expect(summary(page)).toContainText('1–5000');
  expect(await page.locator('.torrent-file-table .n-data-table-tr').count()).toBeLessThan(100);
  await pageNumber(page, 2);
  await page.reload();
  await page.locator('[data-torrent-id="1"] .torrent-name').click();
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await expect(summary(page)).toContainText('1–5000');
  await expect(page.locator('.list-footer')).toContainText('200 / page');
  await pageNumber(page, 2);
  state.files = state.files.slice(0, 1);
  await page.getByRole('button', { name: 'Refresh file list', exact: true }).click();
  await expect(summary(page)).toContainText('1–1');
  await expect(page.locator('.file-page-controls')).toContainText('Page 1 of 1');
  state.files = [];
  await page.getByRole('button', { name: 'Refresh file list', exact: true }).click();
  await expect(summary(page)).toContainText('0–0');
  await expect(summary(page)).toContainText('0 matching / 0 files');
});
test('file refresh failures recover and controls stay reachable in light/dark narrow layouts', async ({
  page,
}, info) => {
  const state = await fixture(page);
  expect((await page.locator('.file-list-footer').boundingBox())!.height).toBeLessThanOrEqual(100);
  state.fail = true;
  await page.getByRole('button', { name: 'Refresh file list', exact: true }).click();
  await expect(page.locator('.detail-pane')).toContainText('file read rejected');
  state.fail = false;
  await page.getByRole('button', { name: 'Refresh file list', exact: true }).click();
  await expect(page.locator('.detail-pane')).not.toContainText('file read rejected');
  for (const skin of ['Modern', 'Metro', 'Material', 'Cupertino']) {
    await page.getByRole('button', { name: 'Visual themes', exact: true }).click();
    await page.locator('.theme-dialog').getByRole('button', { name: skin, exact: true }).click();
    await page.keyboard.press('Escape');
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode });
      await page.setViewportSize({ width: 390, height: 800 });
      await expect(page.locator('.file-list-footer')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const bounds = await page.locator('.file-list-footer').boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      await expect(
        page.getByRole('button', { name: 'Refresh file list', exact: true }),
      ).toBeVisible();
      const actions = (await page.locator('.file-action-controls').boundingBox())!;
      const modeButton = (await page.locator('.color-mode-toggle').boundingBox())!;
      expect(actions.y + actions.height).toBeLessThanOrEqual(modeButton.y);
      await page.screenshot({ path: info.outputPath(`files-${skin}-${mode}-mobile.png`) });
    }
  }
});
