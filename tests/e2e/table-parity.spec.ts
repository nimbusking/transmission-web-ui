import { expect, test, type Page } from '@playwright/test';
import {
  DEFAULT_COLUMNS,
  PREVIOUS_DEFAULT_COLUMNS,
  defaultSettings,
} from '../../src/domain/torrents';
async function fixture(page: Page, count = 3, old = false) {
  const settings = defaultSettings();
  settings.labels = [{ id: 'one', name: 'One', color: '#123456' }];
  settings.torrentLabels = { ['a'.repeat(40)]: ['one'] };
  if (old) {
    delete settings.ui.columnPresetVersion;
    settings.ui.columns = structuredClone(PREVIOUS_DEFAULT_COLUMNS);
  }
  await page.addInitScript(async (settings) => {
    const ready = new Promise<void>((resolve) => {
      const open = indexedDB.open('transmission-web-ui', 2);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('data')) open.result.createObjectStore('data');
      };
      open.onsuccess = () => {
        const db = open.result,
          tx = db.transaction('data', 'readwrite');
        const key = `${location.origin}/rpc:settings`;
        const get = tx.objectStore('data').get(key);
        get.onsuccess = () => {
          if (!get.result) tx.objectStore('data').put(settings, key);
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      await ready;
      return originalFetch(...args);
    };
  }, settings);
  const rows = Array.from({ length: count }, (_, id) => ({
    id: id + 100,
    name: `Task ${String(id).padStart(3, '0')}`,
    hashString: id === 0 ? 'a'.repeat(40) : (id + 100).toString(16).padStart(40, '0'),
    downloadDir: '/data/a',
    status: id === 1 ? 2 : 0,
    totalSize: 1024,
    leftUntilDone: 512,
    haveValid: 512,
    haveUnchecked: 0,
    percentDone: 0.5,
    recheckProgress: 0.25,
    eta: -1,
    queuePosition: id,
    addedDate: 1700000000,
    doneDate: 0,
    activityDate: 0,
    uploadedEver: 2048,
    uploadRatio: -2,
    rateDownload: 0,
    rateUpload: 0,
    trackers: [{ id: 0, tier: 0, announce: 'http://modern:8080/announce?passkey=secret' }],
    trackerStats: [{ id: 0, tier: 0, announce: '', seederCount: -1, leecherCount: 0 }],
    peersSendingToUs: 0,
    peersGettingFromUs: 0,
  }));
  const writes: string[] = [];
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON();
    if (!['session-get', 'torrent-get', 'session-stats'].includes(b.method)) writes.push(b.method);
    await route.fulfill({
      json: {
        result: 'success',
        arguments:
          b.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : b.method === 'torrent-get'
              ? { torrents: rows }
              : {},
        tag: b.tag,
      },
    });
  });
  return writes;
}
test('twenty headers, safe values, check progress, drag order and row label entry', async ({
  page,
}) => {
  const writes = await fixture(page, 3, true);
  await page.goto('/?lang=zh-CN');
  await expect(page.locator('.column-head')).toHaveCount(20);
  expect(await page.locator('.column-head').first().getAttribute('data-column-key')).toBe('name');
  expect(
    await page
      .locator('.column-head')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-column-key'))),
  ).toEqual(DEFAULT_COLUMNS.filter((x) => x.visible).map((x) => x.key));
  expect(
    (await page.locator('.column-sort').allTextContents()).map((s) => s.replace(/ [↑↓]$/, '')),
  ).toEqual([
    '名称',
    '总大小',
    '进度',
    '剩余时间',
    '分享率',
    '状态',
    '种子|活跃',
    '下载|活跃',
    '下载速度',
    '上传速度',
    '已完成',
    '已上传',
    '添加时间',
    '#',
    '队列',
    '服务器',
    '保存目录',
    '最后活动于',
    '用户标签',
    '完成时间',
  ]);
  const row = page.locator('[data-torrent-id="100"]');
  await expect(row.locator('.row-number')).toHaveText('1');
  await expect(row).toContainText('1.00 KB');
  await expect(row).toContainText('2.00 KB'); // Other byte columns retain their existing units.
  await expect(row).toContainText('512.00 B');
  await expect(row).not.toContainText('1970');
  await expect(row).not.toContainText('secret');
  await expect(row).toContainText('modern:8080');
  await expect(row).toContainText('— (0)');
  await expect(page.locator('[data-torrent-id="101"] .progress-cell')).toContainText('25.00%');
  await page.locator('[data-torrent-id="101"]').getByRole('checkbox').click();
  await row.getByRole('button', { name: '编辑Task 000的用户标签', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('One');
  await expect(page.getByRole('dialog')).toContainText('Task 000');
  await expect(page.getByRole('dialog')).not.toContainText('Task 001');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.list-footer')).toContainText('1');
  expect(writes).toEqual([]);
  // Return the horizontally scrolled table to the first header through the actual locator.
  const total = page.locator('[data-column-key="totalSize"] .column-sort');
  const name = page.locator('[data-column-key="name"] .column-sort');
  await total.dragTo(name);
  await expect(page.locator('.column-head').first()).toHaveAttribute(
    'data-column-key',
    'totalSize',
  );
  await page.reload();
  await expect(page.locator('.column-head').first()).toHaveAttribute(
    'data-column-key',
    'totalSize',
  );
  await page.getByRole('button', { name: '列设置', exact: true }).click();
  await expect(page.getByRole('button', { name: /应用旧版完整列表|恢复上一份列布局/ })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'close', exact: true }).click();
  await expect(page.locator('.column-head')).toHaveCount(20);
});
test('footer page size, jump, offsets, persistence, empty and mobile bounds', async ({ page }) => {
  await fixture(page, 205);
  await page.goto('/?lang=en');
  await expect(page.locator('.list-footer')).toContainText('1–200 of 205');
  const jump = page.locator('.n-pagination-quick-jumper input');
  await jump.fill('2');
  await jump.press('Enter');
  await expect(page.locator('.list-footer')).toContainText('201–205 of 205');
  await expect(page.locator('[data-torrent-id]').first().locator('.row-number')).toHaveText('201');
  await page.locator('[data-torrent-id]').first().getByRole('checkbox').click();
  await page.locator('.list-footer .n-base-selection').click();
  await page.getByText('10 / page', { exact: true }).click();
  await expect(page.locator('.list-footer')).toContainText('1–10 of 205');
  await expect(page.locator('.list-footer')).not.toContainText('selected');
  await page.reload();
  await expect(page.locator('.list-footer')).toContainText('1–10 of 205');
  await page.locator('.list-footer .n-base-selection').click();
  await page.getByText('5000 / page', { exact: true }).click();
  await expect(page.locator('.list-footer')).toContainText('1–205 of 205');
  expect(await page.locator('[data-torrent-id]').count()).toBeLessThan(100);
  await page.getByPlaceholder('Search names, separate keywords with spaces').fill('no matches');
  await expect(page.locator('.list-footer')).toContainText('0–0 of 0');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});
