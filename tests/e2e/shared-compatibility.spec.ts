import { expect, test, type Page } from '@playwright/test';
async function mock(page: Page, version = '4.1.4') {
  const row: any = {
    id: 1,
    hashString: 'a'.repeat(40),
    name: 'Compatibility fixture',
    downloadDir: '/data',
    status: 0,
    metadataPercentComplete: 1,
    totalSize: 32768,
    haveValid: 16384,
    haveUnchecked: 0,
    leftUntilDone: 0,
    percentDone: 1,
    downloadLimited: true,
    downloadLimit: 123,
    uploadLimited: false,
    uploadLimit: 456,
    trackers: [
      { id: 0, announce: 'http://a.test/announce', tier: 0 },
      { id: 1, announce: 'http://b.test/announce', tier: 1 },
    ],
    trackerStats: [
      { id: 0, announce: 'http://a.test/announce', tier: 0, seederCount: 10, leecherCount: -1 },
      { id: 1, announce: 'http://b.test/announce', tier: 1, seederCount: 10, leecherCount: -1 },
    ],
    peersSendingToUs: 0,
    peersGettingFromUs: 2,
  };
  const writes: any[] = [];
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON();
    let args: any = {};
    if (b.method === 'session-get') args = { version, 'rpc-version': version === '3.00' ? 16 : 17 };
    if (b.method === 'torrent-get')
      args = {
        torrents:
          !Array.isArray(b.arguments.ids) ||
          b.arguments.ids.includes(row.id) ||
          b.arguments.ids.includes(row.hashString)
            ? [
                Object.fromEntries(
                  b.arguments.fields
                    .filter((key: string) => key in row)
                    .map((key: string) => [key, row[key]]),
                ),
              ]
            : [],
      };
    if (b.method === 'torrent-set') {
      writes.push(b);
      if (b.arguments.ids.includes(row.hashString)) {
        Object.assign(row, b.arguments);
        if ('trackerList' in b.arguments)
          row.trackers = b.arguments.trackerList
            .split('\n\n')
            .flatMap((group: string, tier: number) =>
              group
                .split('\n')
                .filter(Boolean)
                .map((announce: string, id: number) => ({ id: 10 + id, announce, tier })),
            );
        if (b.arguments.trackerAdd)
          for (const announce of b.arguments.trackerAdd)
            row.trackers.push({
              id: Math.max(-1, ...row.trackers.map((x: any) => x.id)) + 1,
              tier: Math.max(-1, ...row.trackers.map((x: any) => x.tier)) + 1,
              announce,
            });
        if (b.arguments.trackerRemove)
          row.trackers = row.trackers
            .filter((x: any) => !b.arguments.trackerRemove.includes(x.id))
            .map((x: any, id: number) => ({ ...x, id }));
        if (b.arguments.trackerReplace)
          for (let i = 0; i < b.arguments.trackerReplace.length; i += 2)
            row.trackers.find((x: any) => x.id === b.arguments.trackerReplace[i]).announce =
              b.arguments.trackerReplace[i + 1];
      }
    }
    await route.fulfill({ json: { result: 'success', arguments: args, tag: b.tag } });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('[data-torrent-id="1"]')).toBeVisible();
  return { row, writes };
}
test('held bytes and reports agree between table and overview; download-only limits preserve upload', async ({
  page,
}) => {
  const { row, writes } = await mock(page);
  await expect(page.locator('[data-torrent-id="1"]')).toContainText('16.00 KB');
  await expect(page.locator('[data-torrent-id="1"]')).toContainText('20 (0)');
  await page.locator('.torrent-name').click();
  await expect(page.locator('.overview-grid')).toContainText('16.0 KB');
  await expect(page.locator('.overview-grid')).toContainText('— (2)');
  await page.getByRole('checkbox', { name: 'Compatibility fixture', exact: true }).check();
  await page
    .locator('.toolbar')
    .getByRole('button', { name: 'Transfer limits', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('123 KB/s');
  await expect(dialog).toContainText('456 KB/s');
  await expect(dialog.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
  await dialog.locator('.n-select').first().click();
  await page
    .locator('.n-base-select-option')
    .filter({ hasText: /^Limit to$/ })
    .click();
  await dialog.locator('.n-input-number input').fill('321');
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].arguments).toEqual({ ids: ['a'.repeat(40)], downloadLimit: 321 });
  expect(row.uploadLimit).toBe(456);
  expect(row.uploadLimited).toBe(false);
  await expect(dialog.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
});
for (const version of ['3.00', '4.1.4'])
  test(`${version} Tracker UI preserves supported edit scope`, async ({ page }) => {
    const { writes } = await mock(page, version);
    await page.locator('.torrent-name').click();
    await page.getByRole('tab', { name: 'Servers', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog');
    if (version === '3.00') {
      await expect(dialog.locator('textarea')).toHaveCount(0);
      await dialog.getByRole('textbox').first().fill('http://changed.test/announce');
      await dialog.getByRole('button', { name: 'Remove', exact: true }).last().click();
      await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
      expect(writes).toEqual([]);
    } else {
      await dialog.locator('textarea').fill('http://a.test/announce\nhttp://b.test/announce');
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(writes).toHaveLength(1);
      expect(writes[0].arguments.trackerList).toBe(
        'http://a.test/announce\nhttp://b.test/announce',
      );
    }
  });
test('ID reuse clears checked target, detail and already-open context range', async ({ page }) => {
  const { row, writes } = await mock(page);
  await page.getByRole('checkbox', { name: 'Compatibility fixture', exact: true }).check();
  await page.locator('.torrent-name').click();
  await page.locator('.torrent-name').click({ button: 'right' });
  row.hashString = 'b'.repeat(40);
  row.name = 'Replacement';
  await page.keyboard.press('Escape');
  await page.locator('.toolbar').getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('.torrent-name')).toHaveText('Replacement');
  await expect(page.locator('.detail-content')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Replacement', exact: true })).not.toBeChecked();
  expect(writes).toEqual([]);
});

test('limit and Tracker forms fit all four skins in light/dark narrow screens', async ({
  page,
}, info) => {
  await mock(page);
  await page.getByRole('checkbox', { name: 'Compatibility fixture', exact: true }).check();
  for (const skin of ['Modern', 'Metro', 'Material', 'Cupertino']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Visual themes', exact: true }).click();
    await page.locator('.theme-dialog').getByRole('button', { name: skin, exact: true }).click();
    await page.keyboard.press('Escape');
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode });
      await page.setViewportSize({ width: 390, height: 800 });
      await page
        .locator('.toolbar')
        .getByRole('button', { name: 'Transfer limits', exact: true })
        .click();
      await expect(page.getByRole('dialog')).toContainText('123 KB/s');
      const bounds = (await page.getByRole('dialog').boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
      await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
      await page.screenshot({
        path: info.outputPath(`limits-${skin}-${mode}.png`),
        animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      if (!(await page.locator('.detail-content').count()))
        await page.locator('.mobile-transfer').click();
      await page.getByRole('tab', { name: 'Servers', exact: true }).click();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await expect(page.getByRole('dialog').locator('textarea')).toBeVisible();
      const trackerBounds = (await page.getByRole('dialog').boundingBox())!;
      expect(trackerBounds.x).toBeGreaterThanOrEqual(0);
      expect(trackerBounds.x + trackerBounds.width).toBeLessThanOrEqual(390);
      await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
      await page.screenshot({
        path: info.outputPath(`trackers-${skin}-${mode}.png`),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
    }
  }
});
test('5000 rows keep virtual rendering and checked identity through a short refresh', async ({
  page,
}) => {
  const rows = Array.from({ length: 5000 }, (_, id) => ({
    id: id + 1,
    hashString: id.toString(16).padStart(40, '0'),
    name: `Scale ${id}`,
    downloadDir: '/data',
    totalSize: 32768,
    haveValid: 16384,
    haveUnchecked: 0,
    percentDone: 1,
  }));
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON();
    await route.fulfill({
      json: {
        result: 'success',
        tag: b.tag,
        arguments:
          b.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : b.method === 'torrent-get'
              ? {
                  torrents: rows
                    .filter(
                      (row) =>
                        !Array.isArray(b.arguments.ids) ||
                        b.arguments.ids.includes(row.id) ||
                        b.arguments.ids.includes(row.hashString),
                    )
                    .map((row) =>
                      Object.fromEntries(
                        b.arguments.fields
                          .filter((key: string) => key in row)
                          .map((key: string) => [key, (row as any)[key]]),
                      ),
                    ),
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('.section-title')).toContainText('5000 transfers');
  expect(await page.locator('[data-torrent-id]').count()).toBeLessThan(100);
  await page.getByRole('checkbox', { name: 'Scale 0', exact: true }).check();
  rows[0].name = 'Scale retained';
  await page.locator('.toolbar').getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Scale retained', exact: true })).toBeChecked();
  await expect(page.locator('.column-head')).toHaveCount(20);
});

test('changing bulk Tracker inputs invalidates an in-flight preview', async ({ page }) => {
  const { row, writes } = await mock(page);
  await page.getByRole('checkbox', { name: 'Compatibility fixture', exact: true }).check();
  let release: (() => Promise<void>) | undefined;
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON();
    if (
      b.method === 'torrent-get' &&
      b.arguments.fields.length === 4 &&
      b.arguments.fields.includes('trackers')
    ) {
      release = () =>
        route.fulfill({
          json: {
            result: 'success',
            tag: b.tag,
            arguments: {
              torrents: [
                { id: row.id, hashString: row.hashString, name: row.name, trackers: row.trackers },
              ],
            },
          },
        });
      return;
    }
    await route.fallback();
  });
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page
    .locator('.n-dropdown-menu')
    .getByText('Replace trackers in bulk', { exact: true })
    .click();
  await page.getByRole('textbox', { name: /^Match URL text/ }).fill('a.test');
  await page.getByRole('textbox', { name: /^Replacement text/ }).fill('new.test');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole('textbox', { name: /^Replacement text/ }).fill('other.test');
  await release!();
  await expect(page.getByRole('button', { name: /^Apply/ })).toBeDisabled();
  await expect(page.locator('.import-preview')).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('3.00 URL replacement, independent add and independent remove remain available', async ({
  page,
}) => {
  const { writes } = await mock(page, '3.00');
  await page.locator('.torrent-name').click();
  await page.getByRole('tab', { name: 'Servers', exact: true }).click();
  const open = async () => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    return page.getByRole('dialog');
  };
  let dialog = await open();
  await dialog.getByRole('textbox').first().fill('http://new.test/announce');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  dialog = await open();
  await dialog.getByRole('button', { name: 'Add Tracker', exact: true }).click();
  await dialog.getByRole('textbox').last().fill('http://added.test/announce');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  dialog = await open();
  await dialog.getByRole('button', { name: 'Remove', exact: true }).last().click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes.map((b) => Object.keys(b.arguments).filter((key) => key !== 'ids'))).toEqual([
    ['trackerReplace'],
    ['trackerAdd'],
    ['trackerRemove'],
  ]);
});
