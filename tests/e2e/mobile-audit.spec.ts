import { expect, test, type Page } from '@playwright/test';
import { defaultSettings } from '../../src/domain/torrents';
import { SESSION_FIELDS } from '../../src/services/session-fields';

test.use({ hasTouch: true });
const tabs = [
  'Basic settings',
  'Network',
  'Bandwidth limits',
  'Schedule',
  'Folder dictionary',
  'Extra settings',
  'User labels',
];
async function screenshot(page: Page, options: Parameters<Page['screenshot']>[0]) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity,
            ).length,
      ),
    )
    .toBe(0);
  await page.screenshot(options);
}
async function fixture(page: Page, skin = 'modern', dark = false) {
  const settings = defaultSettings();
  settings.ui.visualTheme = skin as typeof settings.ui.visualTheme;
  settings.ui.theme = dark ? 'dark' : 'light';
  settings.labels = [
    {
      id: 'one',
      name: 'Mobile label',
      description: 'Long description for mobile layout',
      color: '#117c6e',
    },
  ];
  settings.folderDictionary = ['/data/downloads', '/data/long-directory-name/mobile'];
  await page.addInitScript((settings) => {
    const ready = new Promise<void>((resolve) => {
      const open = indexedDB.open('transmission-web-ui', 2);
      open.onupgradeneeded = () => open.result.createObjectStore('data');
      open.onsuccess = () => {
        const db = open.result,
          tx = db.transaction('data', 'readwrite');
        tx.objectStore('data').put(settings, `${location.origin}/rpc:settings`);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      await ready;
      return original(...args);
    };
  }, settings);
  const session: Record<string, unknown> = {
    version: '4.1.4',
    'rpc-version': 19,
    'config-dir': '/config',
  };
  for (const field of SESSION_FIELDS)
    session[field.key] =
      field.type === 'boolean'
        ? true
        : field.type === 'number'
          ? Math.max(100, field.min ?? 0)
          : field.key === 'encryption'
            ? 'preferred'
            : '/data/downloads';
  Object.assign(session, {
    'alt-speed-time-begin': 540,
    'alt-speed-time-end': 1020,
    'alt-speed-time-day': 62,
  });
  const writes: unknown[] = [];
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'session-set') {
      writes.push(body.arguments);
      Object.assign(session, body.arguments);
    }
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? session
            : body.method === 'torrent-get'
              ? {
                  torrents: [
                    {
                      id: 1,
                      hashString: 'a'.repeat(40),
                      name: 'A very long mobile torrent name for testing selection and details',
                      status: 0,
                      percentDone: 0.5,
                      totalSize: 1024,
                      downloadDir: '/data',
                      files: [],
                      trackers: [],
                      peers: [],
                    },
                  ],
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.getByLabel('Username', { exact: true })).toBeEnabled();
  return { writes };
}
async function enter(page: Page) {
  await page.getByLabel('Username', { exact: true }).fill('mobile');
  await page.getByRole('button', { name: 'Enter workspace', exact: true }).tap();
  await expect(page.locator('.workspace')).toBeVisible();
}
async function bounded(page: Page, selector: string) {
  const metrics = await page.locator(selector).evaluate((el) => {
    const box = el.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      width: innerWidth,
      overflow: el.scrollWidth - el.clientWidth,
    };
  });
  expect.soft(metrics.left, selector).toBeGreaterThanOrEqual(-1);
  expect.soft(metrics.right, selector).toBeLessThanOrEqual(metrics.width + 1);
  expect.soft(metrics.overflow, selector).toBeLessThanOrEqual(2);
}
const cases = [
  ...[320, 360, 390, 430, 600].map((width) => ({ width, skin: 'modern', dark: false })),
  ...['modern', 'metro', 'material', 'cupertino'].flatMap((skin) =>
    (skin === 'modern' ? [true] : [false, true]).map((dark) => ({ width: 390, skin, dark })),
  ),
];
for (const { width, skin, dark } of cases) {
  test(`mobile audit ${width} ${skin} ${dark ? 'dark' : 'light'}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const { writes } = await fixture(page, skin, dark);
    await bounded(page, '.login-page');
    await expect(page.locator('.login-form input').first()).toHaveCSS('font-size', '16px');
    await screenshot(page, { path: info.outputPath('login.png'), animations: 'disabled' });
    await page.getByLabel('Password', { exact: true }).fill('demo');
    await page.setViewportSize({ width, height: 380 });
    await page
      .getByRole('button', { name: 'Enter workspace', exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('button', { name: 'Enter workspace', exact: true }),
    ).toBeInViewport();
    await page.setViewportSize({ width, height: 844 });
    await enter(page);
    const mode = page.locator('.workspace .color-mode-toggle');
    await expect(mode).toBeHidden();
    await page.getByRole('button', { name: 'Open navigation', exact: true }).tap();
    await expect(mode).toBeVisible();
    const drawer = await page.locator('.sidebar').boundingBox();
    const toggle = await mode.boundingBox();
    expect(toggle!.x).toBeGreaterThanOrEqual(drawer!.x);
    expect(toggle!.x + toggle!.width).toBeLessThanOrEqual(drawer!.x + drawer!.width);
    expect(toggle!.y + toggle!.height).toBeLessThanOrEqual(drawer!.y + drawer!.height);
    await mode.tap();
    await page.getByRole('button', { name: 'Close navigation', exact: true }).first().tap();
    await expect(mode).toBeHidden();
    const row = page.locator('.mobile-transfer').first();
    await expect(row.locator('.mobile-transfer-percentage')).toHaveText('50.0%');
    await bounded(page, '.mobile-transfer-progress');
    const centers = await row.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        c = el.querySelector('.n-checkbox-box')!.getBoundingClientRect();
      return {
        delta: Math.abs(r.y + r.height / 2 - c.y - c.height / 2),
        width: c.width,
        height: c.height,
      };
    });
    expect.soft(centers.delta, 'checkbox vertical centering').toBeLessThanOrEqual(1);
    const target = await row.getByRole('checkbox').boundingBox();
    expect(target!.width).toBeGreaterThanOrEqual(43.9);
    expect(target!.height).toBeGreaterThanOrEqual(43.9);
    await screenshot(page, { path: info.outputPath('torrent-list.png'), animations: 'disabled' });
    await row.getByRole('checkbox').tap();
    await expect(row.getByRole('checkbox')).toBeChecked();
    await expect(page.locator('.detail-pane')).toHaveCount(0);
    await row.locator('strong').tap();
    await expect(page.locator('.detail-pane')).toBeVisible();
    await page.getByRole('button', { name: 'Collapse details', exact: true }).tap();
    await expect(page.locator('.detail-pane')).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await page.locator('.settings-dialog > .n-card-header').tap();
    for (const name of tabs) {
      await page.locator('.settings-dialog .n-tabs-tab').getByText(name, { exact: true }).tap();
      await bounded(page, '.settings-dialog');
      await bounded(page, '.settings-dialog > .n-card-content');
      await bounded(page, '.n-tab-pane:visible');
      if (skin === 'modern' && [320, 390].includes(width))
        await screenshot(page, {
          path: info.outputPath(`${width}-${name.replaceAll(' ', '-')}.png`),
          animations: 'disabled',
        });
      const fonts = await page
        .locator('.n-tab-pane:visible input:not([type=file]), .n-tab-pane:visible textarea')
        .evaluateAll((els) =>
          els
            .filter((el) => el.getBoundingClientRect().width > 0)
            .map((el) => ({
              label: el.getAttribute('id'),
              size: parseFloat(getComputedStyle(el).fontSize),
            })),
        );
      expect
        .soft(
          fonts.filter((f) => f.size < 16),
          'editable fields should not trigger iOS zoom',
        )
        .toEqual([]);
    }
    await page.getByRole('button', { name: 'Import and export', exact: true }).tap();
    await bounded(page, '.settings-transfer');
    await bounded(page, '.settings-transfer > .n-card-content');
    await screenshot(page, { path: info.outputPath('transfer.png'), animations: 'disabled' });
    expect(writes).toEqual([]);
  });
}

for (const width of [320, 390])
  test(`mobile interactions ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const { writes } = await fixture(page);
    await page.getByLabel('Password', { exact: true }).fill('secret');
    await page.locator('.login-form .n-input__eye').tap();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
    await page.locator('.login-form .n-input__eye').tap();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    await page.locator('.login-language').tap();
    await page.getByText('简体中文', { exact: true }).tap();
    await expect(page.getByLabel('用户名', { exact: true })).toBeVisible();
    await page.locator('.login-language').tap();
    await page.getByText('English', { exact: true }).tap();
    await enter(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    const dialog = page.locator('.settings-dialog');
    const choose = async (name: string) => {
      await dialog.locator('.n-tabs-tab').getByText(name, { exact: true }).tap();
    };
    await dialog.locator('.n-card-header').tap();
    await page.locator('#setting-download-dir').fill('/data/long-directory-name/mobile');
    await expect(page.locator('.n-auto-complete-menu')).toBeVisible();
    await bounded(page, '.n-auto-complete-menu');
    await dialog.locator('.n-card-header').tap();
    await page.getByRole('button', { name: 'Save Transmission parameters', exact: true }).tap();
    await expect.poll(() => writes.length).toBe(1);
    await expect(
      page.getByRole('button', { name: 'Save Transmission parameters', exact: true }),
    ).toBeDisabled();
    await choose('Schedule');
    await page.getByRole('textbox', { name: 'Start time', exact: true }).tap();
    await expect(page.locator('.n-time-picker-panel')).toBeVisible();
    await bounded(page, '.n-time-picker-panel');
    await screenshot(page, { path: info.outputPath('time-picker.png'), animations: 'disabled' });
    await dialog.locator('.n-card-header').tap();
    await choose('User labels');
    await page.locator('.settings-label-row .n-color-picker').tap();
    await expect(page.locator('.n-color-picker-panel')).toBeVisible();
    await bounded(page, '.n-color-picker-panel');
    await screenshot(page, { path: info.outputPath('color-picker.png'), animations: 'disabled' });
    await dialog.locator('.n-card-header').tap();
    await page.getByPlaceholder('Label name', { exact: true }).fill('Mobile changed');
    await page
      .locator('.settings-label-row')
      .getByRole('button', { name: 'Save', exact: true })
      .tap();
    await choose('Folder dictionary');
    await page
      .getByRole('textbox', { name: 'Directory dictionary', exact: true })
      .fill('/data/mobile');
    await page
      .locator('.n-tab-pane:visible')
      .getByRole('button', { name: 'Save', exact: true })
      .tap();
    await page.getByRole('button', { name: 'Import and export', exact: true }).tap();
    await page.getByTestId('config-import').setInputFiles({
      name: 'mobile.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          configVersion: 1,
          server: { 'download-dir': '/data/' + 'long-directory/'.repeat(12) },
        }),
      ),
    });
    await page
      .locator('.import-preview')
      .getByRole('checkbox', { name: 'Transmission parameters', exact: true })
      .check();
    await page.getByRole('button', { name: /^Apply daemon changes/ }).tap();
    await expect(page.locator('.diff-table')).toBeVisible();
    await bounded(page, '.diff-table');
    await expect(page.locator('.diff-table td').first()).toHaveCSS('display', 'block');
    await screenshot(page, {
      path: info.outputPath('import-confirmation.png'),
      animations: 'disabled',
    });
    // Inspect the proposed import; leave daemon writes at the one explicit test save.
    expect(writes).toHaveLength(1);
    await page
      .locator('.n-modal')
      .filter({ has: page.locator('.diff-table') })
      .locator('.n-base-close')
      .tap();
    await page.locator('.settings-transfer .n-base-close').tap();
    await page.setViewportSize({ width: 844, height: 390 });
    await bounded(page, '.settings-dialog');
    await expect(dialog.locator('.n-card__footer')).toBeInViewport();
    await screenshot(page, { path: info.outputPath('landscape.png'), animations: 'disabled' });
    await dialog.locator('.n-base-close').tap();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await expect(page.locator('#setting-download-dir')).toHaveValue(
      '/data/long-directory-name/mobile',
    );
    await choose('User labels');
    await expect(page.getByPlaceholder('Label name', { exact: true })).toHaveValue(
      'Mobile changed',
    );
    await choose('Folder dictionary');
    await expect(
      page.getByRole('textbox', { name: 'Directory dictionary', exact: true }),
    ).toHaveValue('/data/mobile');
    await dialog.locator('.n-base-close').tap();
  });

for (const width of [320, 390])
  test(`Chinese mobile settings ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const { writes } = await fixture(page, 'modern', true);
    await page.locator('.login-language').tap();
    await page.getByText('简体中文', { exact: true }).tap();
    await page.getByLabel('用户名', { exact: true }).fill('mobile');
    await screenshot(page, { path: info.outputPath('login-zh.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '进入工作台', exact: true }).tap();
    await expect(page.locator('.workspace')).toBeVisible();
    await screenshot(page, { path: info.outputPath('list-zh.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '设置', exact: true }).tap();
    await page.locator('.settings-dialog > .n-card-header').tap();
    for (const name of [
      '基本设置',
      '网络传输',
      '带宽限制',
      '时段限制',
      '目录字典',
      '额外设置',
      '用户标签',
    ]) {
      await page.locator('.settings-dialog .n-tabs-tab').getByText(name, { exact: true }).tap();
      await bounded(page, '.settings-dialog > .n-card-content');
      await bounded(page, '.n-tab-pane:visible');
      await screenshot(page, { path: info.outputPath(`${name}.png`), animations: 'disabled' });
    }
    expect(writes).toEqual([]);
  });
