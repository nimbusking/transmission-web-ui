import { expect, test } from '@playwright/test';
import { defaultSettings } from '../../src/domain/torrents';
import { VISUAL_THEME_IDS, visualProfile } from '../../src/domain/visual-themes';

for (const skin of VISUAL_THEME_IDS) {
  for (const dark of [false, true]) {
    test(`add controls remain visible when unfocused: ${skin} ${dark ? 'dark' : 'light'}`, async ({
      page,
    }) => {
      const settings = defaultSettings();
      settings.ui.visualTheme = skin;
      settings.ui.theme = dark ? 'dark' : 'light';
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
      await page.route('**/rpc', (route) => {
        const body = route.request().postDataJSON();
        return route.fulfill({
          json: {
            result: 'success',
            tag: body.tag,
            arguments:
              body.method === 'session-get'
                ? { version: '4.1.4', 'rpc-version': 19, 'download-dir': '/data' }
                : body.method === 'torrent-get'
                  ? { torrents: [] }
                  : {},
          },
        });
      });
      await page.goto('/?lang=zh-CN');
      await page.getByLabel('用户名', { exact: true }).fill('demo');
      await page.getByRole('button', { name: '进入工作台', exact: true }).click();
      await page.getByRole('button', { name: '添加任务', exact: true }).click();
      const dialog = page.locator('.medium-dialog');
      await dialog.locator('.n-card-header').click();
      if (dark) {
        const p = visualProfile(skin, true).palette;
        const rgb = (hex: string) =>
          `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
        for (const field of ['.add-directory .n-input', '.torrent-address .n-input']) {
          await expect(dialog.locator(field)).toHaveCSS('background-color', rgb(p.subtle));
          await expect(dialog.locator(`${field} .n-input__border`)).toHaveCSS(
            'border-top-color',
            rgb(p.muted),
          );
          await expect(dialog.locator(`${field} .n-input__border`)).toHaveCSS(
            'border-top-width',
            '1px',
          );
        }
        await expect(dialog.locator('.n-base-selection .n-base-selection__border')).toHaveCSS(
          'border-top-color',
          rgb(p.muted),
        );
        await expect(dialog.locator('.torrent-address textarea')).toHaveCSS('color', rgb(p.text));
      }
      await page.screenshot({
        path: `artifacts/add-contrast-${skin}-${dark ? 'dark' : 'light'}.png`,
      });
      if (skin === 'cupertino' && dark) {
        await page.setViewportSize({ width: 390, height: 844 });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true);
        await page.screenshot({ path: 'artifacts/add-contrast-mobile.png' });
      }
    });
  }
}
