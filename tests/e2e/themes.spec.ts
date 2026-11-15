import { expect, test, type Page } from '@playwright/test';
import { defaultSettings } from '../../src/domain/torrents';

const themes = {
  workbench: 'Workbench',
  console: 'Console',
  studio: 'Studio',
  focus: 'Focus',
} as const;
async function fixture(page: Page) {
  const initial = defaultSettings();
  delete initial.ui.layoutTheme; // Existing v2 installation, not a reset/new-settings-only test.
  initial.ui.autoRefresh = false;
  initial.ui.columns[0].width = 365;
  await page.addInitScript((settings) => {
    const original = window.fetch.bind(window);
    const ready = new Promise<void>((resolve) => {
      const open = indexedDB.open('transmission-web-ui', 2);
      open.onupgradeneeded = () => open.result.createObjectStore('data');
      open.onsuccess = () => {
        const db = open.result,
          tx = db.transaction('data', 'readwrite'),
          key = `${location.origin}/rpc:settings`;
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
    window.fetch = async (...args) => {
      await ready;
      return original(...args);
    };
  }, initial);
  const calls: string[] = [];
  const rows = [1, 2].map((id) => ({
    id,
    hashString: String(id).repeat(40),
    name: `Theme task ${id}`,
    status: 0,
    downloadDir: '/data/themes',
    percentDone: 0.5,
    totalSize: 1024,
    files: [],
    trackers: [],
    peers: [],
  }));
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body.method);
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : body.method === 'torrent-get'
              ? { torrents: rows }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeEnabled();
  return calls;
}
async function choose(page: Page, id: keyof typeof themes) {
  await page.getByRole('button', { name: 'Layouts', exact: true }).click();
  const dialog = page.locator('.layout-dialog');
  await dialog.getByRole('button', { name: themes[id], exact: true }).click();
  await expect(page.locator('.workspace')).toHaveAttribute('data-layout-theme', id);
  await expect(dialog.getByRole('button', { name: themes[id], exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
}
test('layout and sun/moon persist independently, preserve task context and support system appearance', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const calls = await fixture(page);
  await expect(page.locator('.workspace')).toHaveAttribute('data-layout-theme', 'workbench');
  await page.getByRole('checkbox', { name: 'Theme task 1', exact: true }).check();
  await page.locator('[data-torrent-id="1"] .torrent-name').click();
  await expect(page.locator('.detail-pane')).toContainText('Theme task 1');
  for (const id of Object.keys(themes) as (keyof typeof themes)[]) {
    await choose(page, id);
    await expect(page.getByRole('checkbox', { name: 'Theme task 1', exact: true })).toBeChecked();
    await expect(page.locator('.detail-pane')).toContainText('Theme task 1');
    await expect(page.locator('.column-head[data-column-key="name"]')).toHaveCSS('width', '345px');
  }
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('.application')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('.workspace')).toHaveAttribute('data-layout-theme', 'focus');
  await expect(page.locator('.application')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('tree', { name: 'Navigation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation', exact: true }).first().click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Visual themes', exact: true }).click();
  await page.getByRole('button', { name: 'Follow system appearance', exact: true }).click();
  await expect(page.locator('.application')).not.toHaveClass(/dark/);
  await page.keyboard.press('Escape');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('.application')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect(page.locator('.application')).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('.application')).not.toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.large-dialog')).toBeVisible();
  await expect(page.locator('.large-dialog').getByText('Theme', { exact: true })).toHaveCount(0);
  expect(
    calls.filter((method) => !['session-get', 'torrent-get', 'session-stats'].includes(method)),
  ).toEqual([]);
});

for (const mode of ['light', 'dark'] as const)
  test(`${mode}: four real layouts remain usable at desktop, tablet, mobile and forced desktop`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
    await fixture(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const geometry: any[] = [];
    for (const id of Object.keys(themes) as (keyof typeof themes)[]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await choose(page, id);
      const metrics = await page.evaluate(() => {
        const box = (selector: string) =>
          document.querySelector(selector)!.getBoundingClientRect().toJSON();
        return {
          header: box('.topbar'),
          toolbar: box('.toolbar'),
          sidebar: box('.sidebar'),
          main: box('.main-panel'),
        };
      });
      geometry.push({ id, mode, ...metrics });
      if (id === 'workbench') {
        expect(metrics.header.height).toBe(66);
        expect(metrics.sidebar.width).toBe(290);
      }
      if (id === 'console') {
        expect(metrics.header.height).toBe(52);
        expect(metrics.toolbar.height).toBe(42);
        expect(metrics.sidebar.width).toBe(220);
      }
      if (id === 'studio') {
        expect(metrics.sidebar.top).toBe(0);
        expect(metrics.sidebar.width).toBe(260);
        expect(metrics.toolbar.left).toBe(276);
        expect(metrics.main.left).toBe(276);
      }
      if (id === 'focus') {
        await expect(page.locator('.sidebar')).toBeHidden();
        expect(metrics.main.left).toBe(56);
      }
      await page.screenshot({ path: testInfo.outputPath(`${id}-${mode}.png`) });
      for (const width of [1024, 800, 390]) {
        await page.setViewportSize({ width, height: 800 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const trigger = page.getByRole('button', { name: 'Layouts', exact: true });
        const box = (await trigger.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        const toggle = page.locator('.color-mode-toggle');
        const toggleBox = (await toggle.boundingBox())!;
        const footerBox = (await page.locator('.sidebar-bottom').boundingBox())!;
        expect(footerBox.x).toBeLessThan(60);
        expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(width);
        expect(toggleBox.y + toggleBox.height).toBeLessThanOrEqual(800);
        await expect(page.locator('.sidebar-caption')).toHaveCount(0);
        const statusBox = (await page.locator('.workspace-statusbar').boundingBox())!;
        expect(statusBox.x).toBe(0);
        expect(statusBox.width).toBe(width);
        expect(statusBox.y + statusBox.height).toBe(800);
        expect(toggleBox.y + toggleBox.height).toBeLessThanOrEqual(statusBox.y);
        if (width === 390) {
          await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
          await expect(page.locator('.sidebar')).toBeVisible();
          await page.locator('.navigation-scrim').click({ position: { x: 350, y: 10 } });
          await expect(page.locator('.sidebar')).toBeHidden();
          await trigger.click();
          const background = await page
            .locator('.theme-preview')
            .first()
            .evaluate((node) => getComputedStyle(node).backgroundColor);
          expect(background).not.toBe('rgba(0, 0, 0, 0)');
          await page.keyboard.press('Escape');
        }
      }
      await page.goto('/?lang=en&devicetype=computer');
      await expect(page.locator('.workspace')).toHaveClass(/force-desktop/);
      await page.getByRole('button', { name: 'Layouts', exact: true }).click();
      await expect(page.locator('.layout-dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.goto('/?lang=en');
    }
    await testInfo.attach('layout-geometry.json', {
      body: JSON.stringify(geometry, null, 2),
      contentType: 'application/json',
    });
    expect(errors).toEqual([]);
  });

test('two tabs synchronize layout and color without losing either preference', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await fixture(page);
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: 'light' });
  await fixture(other);
  await choose(page, 'studio');
  await expect(other.locator('.workspace')).toHaveAttribute('data-layout-theme', 'studio');
  await other.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('.application')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('.workspace')).toHaveAttribute('data-layout-theme', 'studio');
  await expect(page.locator('.application')).toHaveClass(/dark/);
});
