import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { defaultSettings } from '../../src/domain/torrents';
import { PROJECT_LINKS } from '../../src/project';
const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

async function fixture(
  page: Page,
  serverVersion = '4.1.4 (build)',
  rpcVersion = 19,
  offline = false,
) {
  const settings = defaultSettings();
  settings.ui.autoRefresh = false;
  await page.addInitScript((initial) => {
    const original = window.fetch.bind(window);
    const ready = new Promise<void>((resolve) => {
      const open = indexedDB.open('transmission-web-ui', 2);
      open.onupgradeneeded = () => open.result.createObjectStore('data');
      open.onsuccess = () => {
        const db = open.result,
          tx = db.transaction('data', 'readwrite');
        tx.objectStore('data').put(initial, `${location.origin}/rpc:settings`);
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
  }, settings);
  const state = { offline, calls: [] as string[], external: [] as string[] };
  const origin = new URL(test.info().project.use.baseURL!).origin;
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== origin) state.external.push(request.url());
  });
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    state.calls.push(body.method);
    if (state.offline) return route.abort('failed');
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? { version: serverVersion, 'rpc-version': rpcVersion }
            : body.method === 'torrent-get'
              ? {
                  torrents: [
                    {
                      id: 1,
                      hashString: '1'.repeat(40),
                      name: 'About task',
                      status: 0,
                      percentDone: 0.5,
                      downloadDir: '/data',
                      trackers: [],
                      files: [],
                      peers: [],
                    },
                  ],
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('.connection')).toContainText(offline ? 'unavailable' : 'Connected');
  return state;
}

for (const [server, rpc] of [
  ['3.00', 16],
  ['4.0.0', 17],
  ['4.0.6', 17],
  ['4.1.4 (a6d907d9ea)', 19],
] as const)
  test(`existing ${server} session is displayed without additional requests`, async ({ page }) => {
    const state = await fixture(page, server, rpc);
    const before = [...state.calls];
    const trigger = page.getByRole('button', { name: 'About', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'About', exact: true });
    await expect(dialog.locator('.about-transmission')).toHaveText(server);
    await expect(dialog.locator('.about-rpc')).toHaveText(String(rpc));
    await expect(dialog.locator('.about-ui-version')).toHaveText(`v${version}`);
    await expect(dialog).toContainText('nimbusk');
    await expect(dialog.locator('.about-cache-hint')).toHaveCount(0);
    await expect(dialog.locator('.brand-symbol')).toHaveCount(1);
    await expect(dialog.locator('.brand-flow')).toHaveCount(0);
    for (const [name, href] of [
      ['Project home', PROJECT_LINKS.home],
      ['User guide', PROJECT_LINKS.guide],
      ['Development updates', PROJECT_LINKS.updates],
      ['Personal blog', 'https://nimbusk.cc'],
      ['MIT License', PROJECT_LINKS.license],
    ]) {
      const link = dialog.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    await expect(dialog.locator('.about-links a')).toHaveCount(4);
    await expect(dialog).not.toContainText(/Thanks|Donate|PT-Plugin|栽培者/);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(state.calls).toEqual(before);
    expect(state.external).toEqual([]);
  });

test('close button, mask and keyboard return focus and preserve selection and detail', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.getByRole('checkbox', { name: 'About task', exact: true }).check();
  await page.locator('[data-torrent-id="1"] .torrent-name').click();
  await expect(page.locator('.detail-pane')).toContainText('About task');
  const before = [...state.calls];
  const trigger = page.getByRole('button', { name: 'About', exact: true });
  for (const close of ['button', 'mask', 'keyboard']) {
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'About', exact: true });
    await expect(dialog).toBeVisible();
    if (close === 'button')
      await dialog.getByRole('button', { name: 'close', exact: true }).click();
    else if (close === 'mask')
      await page.locator('.n-modal-body-wrapper').click({ position: { x: 5, y: 5 } });
    else await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('checkbox', { name: 'About task', exact: true })).toBeChecked();
    await expect(page.locator('.detail-pane')).toContainText('About task');
  }
  expect(state.calls).toEqual(before);
  expect(state.external).toEqual([]);
});

test('disconnected version stays unknown and failed refresh labels cached versions', async ({
  page,
}) => {
  const state = await fixture(page, undefined, undefined, true);
  const trigger = page.getByRole('button', { name: 'About', exact: true });
  await trigger.click();
  const dialog = page.locator('.about-dialog');
  await expect(dialog.locator('.about-transmission')).toHaveText('Connection unavailable');
  await expect(dialog.locator('.about-rpc')).toHaveText('—');
  await expect(dialog.locator('.about-ui-version')).toHaveText(`v${version}`);
  await expect(dialog.locator('.about-cache-hint')).toHaveCount(0);
  await page.keyboard.press('Escape');
  state.offline = false;
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  state.offline = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('.connection')).toContainText('unavailable');
  await trigger.click();
  await expect(dialog.locator('.about-transmission')).toHaveText('4.1.4 (build)');
  await expect(dialog.locator('.about-cache-hint')).toContainText('cached');
  await expect(dialog.locator('.about-cache-hint')).toHaveCSS('font-size', '15px');
});

for (const mode of ['light', 'dark'] as const)
  test(`${mode}: four skins and layouts, narrow screen, Chinese and forced desktop`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180000);
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
    const state = await fixture(page);
    for (const skin of ['Modern', 'Metro', 'Material', 'Cupertino']) {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.getByRole('button', { name: 'Visual themes', exact: true }).click();
      await page.getByRole('button', { name: skin, exact: true }).click();
      await expect(page.locator('.application')).toHaveAttribute(
        'data-visual-theme',
        skin.toLowerCase(),
      );
      await page.keyboard.press('Escape');
      for (const layout of ['Workbench', 'Console', 'Studio', 'Focus']) {
        await page.getByRole('button', { name: 'Layouts', exact: true }).click();
        await page.getByRole('button', { name: layout, exact: true }).click();
        await page.keyboard.press('Escape');
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 800 });
          const triggers = page.locator('.top-actions > .n-button');
          await expect(triggers).toHaveCount(3);
          await expect(triggers.nth(2)).toHaveAttribute('aria-label', 'About');
          const trigger = page.getByRole('button', { name: 'About', exact: true });
          const bounds = (await trigger.boundingBox())!;
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
          await trigger.click();
          const dialog = page.locator('.about-dialog');
          await expect(dialog).toBeVisible();
          const geometry = await dialog.evaluate((node) => {
            const box = node.getBoundingClientRect();
            const links = node.querySelector('.about-links')!.getBoundingClientRect();
            const logo = node.querySelector('.about-logo')!.getBoundingClientRect();
            const contentColor = getComputedStyle(node.querySelector('.about-content')!).color;
            const text = [
              ...node.querySelectorAll('.about-description, dt, dd, .about-license'),
            ].map((element) => {
              const style = getComputedStyle(element);
              return { size: style.fontSize, color: style.color };
            });
            const controlSizes = [
              ...node.querySelectorAll('.about-ui-version, .about-links a'),
            ].map((element) => getComputedStyle(element).fontSize);
            return {
              left: box.left,
              right: box.right,
              width: box.width,
              bottom: box.bottom,
              overflow: node.scrollWidth > node.clientWidth,
              pageOverflow: document.documentElement.scrollWidth > innerWidth,
              linkCenter: (links.left + links.right) / 2,
              logoCenter: (logo.left + logo.right) / 2,
              contentColor,
              text,
              controlSizes,
            };
          });
          expect(geometry.left).toBeGreaterThanOrEqual(0);
          expect(geometry.right).toBeLessThanOrEqual(width);
          expect(geometry.width).toBeLessThanOrEqual(660);
          expect(geometry.bottom).toBeLessThanOrEqual(800);
          expect(geometry.overflow || geometry.pageOverflow).toBe(false);
          expect(Math.abs(geometry.linkCenter - geometry.logoCenter)).toBeLessThan(1);
          for (const text of geometry.text) {
            expect(text.size).toBe('15px');
            expect(text.color).toBe(geometry.contentColor);
          }
          expect(geometry.controlSizes).toEqual(Array(5).fill('15px'));
          await expect(dialog.getByRole('link', { name: 'Personal blog' })).toBeInViewport();
          if (['Modern', 'Cupertino'].includes(skin) && layout === 'Workbench')
            await page.screenshot({
              path: testInfo.outputPath(`about-${skin.toLowerCase()}-${mode}-${width}.png`),
            });
          await page.keyboard.press('Escape');
          await expect(trigger).toBeFocused();
        }
      }
    }
    await page.goto('/?lang=zh-CN&devicetype=computer');
    await expect(page.locator('.workspace')).toHaveClass(/force-desktop/);
    await page.getByRole('button', { name: '关于', exact: true }).click();
    const dialog = page.locator('.about-dialog');
    await expect(dialog).toContainText('作者');
    await expect(dialog.getByRole('link', { name: '更新记录', exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: '个人博客', exact: true })).toHaveAttribute(
      'href',
      'https://nimbusk.cc',
    );
    await expect(dialog).not.toContainText('感谢');
    expect(
      state.calls.filter((m) => !['session-get', 'torrent-get', 'session-stats'].includes(m)),
    ).toEqual([]);
    expect(state.external).toEqual([]);
  });
