import { expect, test, type Page } from '@playwright/test';
import { defaultSettings } from '../../src/domain/torrents';
const skins = ['Modern', 'Metro', 'Material', 'Cupertino'];
const layouts = ['Workbench', 'Console', 'Studio', 'Focus'];
async function fixture(page: Page) {
  const initial = defaultSettings();
  delete initial.ui.visualTheme;
  initial.ui.autoRefresh = false;
  await page.addInitScript((initial) => {
    const ready = new Promise<void>((resolve) => {
      const open = indexedDB.open('transmission-web-ui', 2);
      open.onupgradeneeded = () => open.result.createObjectStore('data');
      open.onsuccess = () => {
        const db = open.result,
          tx = db.transaction('data', 'readwrite'),
          key = `${location.origin}/rpc:settings`;
        const get = tx.objectStore('data').get(key);
        get.onsuccess = () => {
          if (!get.result) tx.objectStore('data').put(initial, key);
        };
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
  }, initial);
  const calls: string[] = [];
  const rows = [1, 2].map((id) => ({
    id,
    hashString: String(id).repeat(40),
    name: `Skin task ${id}`,
    status: 0,
    downloadDir: '/data',
    percentDone: 0.5,
    totalSize: 1024,
    files: [],
    peers: [],
    trackers: [],
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
async function skin(page: Page, name: string) {
  await page.getByRole('button', { name: 'Visual themes', exact: true }).click();
  await page.locator('.theme-dialog').getByRole('button', { name, exact: true }).press('Enter');
  await expect(page.locator('.application')).toHaveAttribute(
    'data-visual-theme',
    name.toLowerCase(),
  );
  await expect(
    page.locator('.theme-dialog').getByRole('button', { name, exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function layout(page: Page, name: string) {
  await page.getByRole('button', { name: 'Layouts', exact: true }).click();
  await page.locator('.layout-dialog').getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.workspace')).toHaveAttribute('data-layout-theme', name.toLowerCase());
  await page.keyboard.press('Escape');
}
for (const mode of ['light', 'dark'] as const)
  test(`${mode}: four visual families cover controls and portals without moving layout or losing targets`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    const calls = await fixture(page);
    await page.getByRole('checkbox', { name: 'Skin task 1', exact: true }).check();
    await page.locator('[data-torrent-id="2"] .torrent-name').click();
    await expect(page.locator('.detail-pane')).toContainText('Skin task 2');
    const retained = await page.locator('[data-torrent-id="1"]').elementHandle();
    const before = await page.locator('.main-panel').boundingBox();
    const results: any[] = [];
    for (const name of skins) {
      await skin(page, name);
      expect(await page.locator('.main-panel').boundingBox()).toEqual(before);
      expect(await retained!.evaluate((node) => node.isConnected)).toBe(true);
      await expect(page.getByRole('checkbox', { name: 'Skin task 1', exact: true })).toBeChecked();
      await expect(page.locator('.detail-pane')).toContainText('Skin task 2');
      const styles = await page.evaluate(() => {
        const computed = (selector: string) => {
          const node = document.querySelector(selector)!;
          const s = getComputedStyle(node);
          return {
            radius: s.borderRadius,
            background: s.backgroundColor,
            image: s.backgroundImage,
            height: node.getBoundingClientRect().height,
          };
        };
        return {
          button: computed('.toolbar .n-button'),
          input: computed('.search-input'),
          checkbox: computed('.n-checkbox-box'),
          table: computed('.n-data-table-th'),
          progress: computed('.progress-cell'),
          row: computed('[data-torrent-id="1"]'),
          accent: getComputedStyle(document.documentElement).getPropertyValue('--accent'),
        };
      });
      expect(styles.button.radius).toBe(
        { Modern: '6px', Metro: '0px', Material: '18px', Cupertino: '8px' }[name],
      );
      expect(styles.input.radius).toBe(
        { Modern: '6px', Metro: '0px', Material: '10px', Cupertino: '8px' }[name],
      );
      expect(styles.checkbox.radius).toBe(name === 'Metro' ? '0px' : '3px');
      expect(styles.row.height).toBeLessThanOrEqual(35);
      expect(styles.progress.height).toBe(20);
      expect(styles.progress.radius).toBe('0px');
      await page.getByRole('button', { name: 'Visual themes', exact: true }).click();
      const previewBackground = await page
        .locator(`.style-preview[data-skin="${name.toLowerCase()}"] .sample-action`)
        .evaluate((node) => getComputedStyle(node).backgroundColor);
      expect(previewBackground).toBe(styles.button.background);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Columns', exact: true }).click();
      const modal = page.locator('.column-settings-dialog');
      await expect(modal).toBeVisible();
      const portal = await modal.evaluate((node) => ({
        radius: getComputedStyle(node).borderRadius,
        shadow: getComputedStyle(node).boxShadow,
        scope: node.closest('.n-modal-container')!.className,
      }));
      expect(portal.radius).toBe(styles.input.radius);
      expect(portal.scope).toContain(`skin-${name.toLowerCase()}-${mode}`);
      if (name === 'Metro') expect(portal.shadow).toBe('none');
      else expect(portal.shadow).not.toBe('none');
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden();
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await expect(page.getByText('Pause all', { exact: true })).toBeVisible();
      const menu = await page.locator('.n-dropdown-menu').evaluate((node) => ({
        radius: getComputedStyle(node).borderRadius,
        text: getComputedStyle(node).color,
      }));
      expect(menu.radius).toBe(styles.input.radius);
      await page.getByRole('heading', { name: 'All transfers', exact: true }).click();
      await expect(page.locator('.n-dropdown-menu')).toBeHidden();
      results.push({ name, mode, styles, portal, menu });
      await page.screenshot({ path: testInfo.outputPath(`${name}-${mode}.png`) });
    }
    expect(new Set(results.map((r) => r.styles.table.background)).size).toBe(4);
    expect(
      calls.filter((method) => !['session-get', 'session-stats', 'torrent-get'].includes(method)),
    ).toEqual([]);
    await testInfo.attach('visual-style-metrics.json', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });
  });

test('all layout/skin/mode pairs retain independent choices and reachable mobile entrances', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await fixture(page);
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode });
    for (const name of layouts) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await layout(page, name);
      const before = await page.locator('.main-panel').boundingBox();
      for (const style of skins) {
        await skin(page, style);
        expect(await page.locator('.main-panel').boundingBox()).toEqual(before);
        await page.setViewportSize({ width: 390, height: 800 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        for (const label of ['Layouts', 'Visual themes']) {
          const button = page.getByRole('button', { name: label, exact: true });
          const box = (await button.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(390);
          await button.press('Enter');
          await expect(page.getByRole('dialog')).toBeVisible();
          const modalBox = (await page.getByRole('dialog').boundingBox())!;
          expect(modalBox.width).toBeLessThanOrEqual(390);
          await page.keyboard.press('Escape');
        }
        await page.setViewportSize({ width: 1440, height: 900 });
      }
    }
  }
});
test('three selections persist across reload and synchronize across tabs', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await fixture(page);
  await layout(page, 'Studio');
  await skin(page, 'Cupertino');
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('.application')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('.application')).toHaveAttribute('data-visual-theme', 'cupertino');
  await expect(page.locator('.workspace')).toHaveAttribute('data-layout-theme', 'studio');
  await expect(page.locator('.application')).toHaveClass(/dark/);
  const other = await context.newPage();
  await fixture(other);
  await skin(other, 'Metro');
  await expect(page.locator('.application')).toHaveAttribute('data-visual-theme', 'metro');
  await expect(page.locator('.workspace')).toHaveAttribute('data-layout-theme', 'studio');
  await expect(page.locator('.application')).toHaveClass(/dark/);
});
