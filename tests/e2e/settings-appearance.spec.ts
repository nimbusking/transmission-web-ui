import { expect, test, type Page } from '@playwright/test';
import { defaultSettings } from '../../src/domain/torrents';
import { SESSION_FIELDS } from '../../src/services/session-fields';
import { visualProfile, type VisualTheme } from '../../src/domain/visual-themes';
const skins = ['Modern', 'Metro', 'Material', 'Cupertino'];
const names = [
  'Basic settings',
  'Network',
  'Bandwidth limits',
  'Schedule',
  'Folder dictionary',
  'Extra settings',
  'User labels',
];
async function fixture(page: Page) {
  const initial = defaultSettings();
  initial.labels = [
    { id: 'appearance-label', name: 'Style label', description: 'Description', color: '#123456' },
  ];
  initial.folderDictionary = ['/data/one', '/data/two'];
  await page.addInitScript((initial) => {
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
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      await ready;
      return original(...args);
    };
  }, initial);
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
            : field.key === 'default-trackers'
              ? 'https://tracker.example/announce'
              : '/data';
  Object.assign(session, {
    'incomplete-dir-enabled': false,
    'speed-limit-down-enabled': false,
    'alt-speed-time-enabled': false,
    'alt-speed-time-begin': 540,
    'alt-speed-time-end': 1020,
    'alt-speed-time-day': 62,
  });
  const writes: unknown[] = [],
    errors: string[] = [],
    resizeNotifications: string[] = [];
  page.on('pageerror', (e) => {
    if (e.message === 'ResizeObserver loop completed with undelivered notifications.')
      resizeNotifications.push(e.message);
    else errors.push(e.message);
  });
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'session-set') writes.push(body.arguments);
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? session
            : body.method === 'torrent-get'
              ? { torrents: [] }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('.connection')).toContainText('Connected');
  return { writes, errors, resizeNotifications };
}
async function skin(page: Page, name: string) {
  await page.getByRole('button', { name: 'Visual themes', exact: true }).click();
  await page.locator('.theme-dialog').getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.application')).toHaveAttribute(
    'data-visual-theme',
    name.toLowerCase(),
  );
  await page.keyboard.press('Escape');
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.settings-path-input')).toBeVisible();
  await page.locator('.settings-dialog > .n-card-header').click();
  await expect(page.locator('.n-auto-complete-menu')).toHaveCount(0);
}
async function choose(page: Page, name: string) {
  await page.locator('.settings-dialog .n-tabs-tab').getByText(name, { exact: true }).click();
  await expect(page.locator('.settings-dialog .n-tabs-tab--active')).toHaveText(name);
}
const rgb = (css: string) =>
  css.startsWith('#')
    ? [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16))
    : css
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
const cssRgb = (hex: string) => `rgb(${rgb(hex).join(', ')})`;
function contrast(a: string, b: string) {
  const l = (css: string) =>
    rgb(css)
      .map((x) => x / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
      .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
  const [hi, lo] = [l(a), l(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
async function frames(page: Page, selector = '.n-tab-pane:visible') {
  return page.locator(selector).evaluate((pane) => {
    const result: {
      kind: string;
      disabled: boolean;
      background: string;
      border: string;
      text: string;
      placeholder?: string;
      width: number;
    }[] = [];
    for (const el of pane.querySelectorAll<HTMLElement>('.n-input')) {
      if (!el.getBoundingClientRect().width) continue;
      const input = el.querySelector<HTMLInputElement>('input,textarea');
      result.push({
        kind: el.closest('.n-input-number')
          ? 'number'
          : el.closest('.n-time-picker')
            ? 'time'
            : el.closest('.n-auto-complete')
              ? 'autocomplete'
              : 'text',
        disabled: el.classList.contains('n-input--disabled'),
        background: getComputedStyle(el).backgroundColor,
        border: getComputedStyle(el.querySelector('.n-input__border')!).borderTopColor,
        text: getComputedStyle(input!).color,
        placeholder: getComputedStyle(el).getPropertyValue('--n-placeholder-color').trim(),
        width: el.getBoundingClientRect().width,
      });
    }
    for (const el of pane.querySelectorAll<HTMLElement>('.n-select .n-base-selection')) {
      if (!el.getBoundingClientRect().width) continue;
      result.push({
        kind: 'select',
        disabled: el.classList.contains('n-base-selection--disabled'),
        background: getComputedStyle(el.querySelector('.n-base-selection-label')!).backgroundColor,
        border: getComputedStyle(el.querySelector('.n-base-selection__border')!).borderTopColor,
        text: getComputedStyle(el.querySelector('.n-base-selection-input')!).color,
        width: el.getBoundingClientRect().width,
      });
    }
    return result;
  });
}
async function outsideStyle(page: Page) {
  return page.locator('.toolbar-refresh .n-input').evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    border: getComputedStyle(el.querySelector('.n-input__border')!).borderTopColor,
    text: getComputedStyle(el.querySelector('input')!).color,
  }));
}
for (const mode of ['dark', 'light'] as const)
  test(`${mode}: all setting input families remain framed across four skins, including disabled and preferences`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
    const state = await fixture(page),
      kinds = new Set<string>(),
      observations: unknown[] = [];
    for (const name of skins) {
      await skin(page, name);
      const p = visualProfile(name.toLowerCase() as VisualTheme, mode === 'dark').palette;
      const outsideBorder = await page.locator('.toolbar-refresh .n-input').evaluate((el) =>
        getComputedStyle(el)
          .getPropertyValue('--n-border')
          .trim()
          .replace(/^1px\s+solid\s+/, ''),
      );
      await expect(page.locator('.toolbar-refresh .n-input__border')).toHaveCSS(
        'border-top-color',
        ['transparent', '#0000', '#00000000'].includes(outsideBorder.toLowerCase())
          ? 'rgba(0, 0, 0, 0)'
          : cssRgb(outsideBorder),
      );
      await expect(page.locator('.toolbar-refresh input')).toHaveCSS('color', cssRgb(p.text));
      const outside = await outsideStyle(page);
      await open(page);
      for (const tab of names) {
        await choose(page, tab);
        if (mode === 'dark')
          await expect
            .poll(async () =>
              (await frames(page)).every(
                (f) =>
                  f.border === cssRgb(p.muted) &&
                  f.background === cssRgb(f.disabled ? p.canvas : p.subtle),
              ),
            )
            .toBe(true);
        const metrics = await frames(page);
        observations.push({ skin: name, tab, frames: metrics });
        for (const f of metrics) {
          kinds.add(f.kind);
          if (mode === 'dark') {
            expect(contrast(f.border, f.background)).toBeGreaterThanOrEqual(3);
            expect(contrast(f.border, p.surface)).toBeGreaterThanOrEqual(3);
            expect(contrast(f.text, f.background)).toBeGreaterThanOrEqual(4.5);
            if (f.placeholder)
              expect(contrast(f.placeholder, f.background)).toBeGreaterThanOrEqual(4.5);
          } else if (!f.disabled) {
            expect(f.background).toBe(cssRgb(name === 'Material' ? p.subtle : p.surface));
            expect(f.border).toBe(cssRgb(p.border));
          }
        }
        if (tab === 'Basic settings') {
          for (const pref of ['locale', 'refreshIntervalMs', 'pageSize'])
            await expect(page.locator(`[data-preference="${pref}"]`)).toBeVisible();
          if (info.project.name === 'chromium' && name === 'Modern') {
            await page.locator('[data-preference="refreshIntervalMs"]').scrollIntoViewIfNeeded();
            await page.screenshot({
              path: `artifacts/settings-contrast-preferences-${mode}.png`,
              animations: 'disabled',
            });
          }
        }
        if (tab === 'User labels')
          await expect(page.getByPlaceholder('Label name', { exact: true })).toHaveValue(
            'Style label',
          );
      }
      expect(await outsideStyle(page)).toEqual(outside);
      await page.setViewportSize({ width: 390, height: 800 });
      await choose(page, 'Basic settings');
      await page.locator('[data-preference="refreshIntervalMs"]').scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          page.locator('.settings-dialog').evaluate((el) => el.scrollWidth - el.clientWidth),
        )
        .toBeLessThanOrEqual(2);
      if (info.project.name === 'chromium' && name === 'Modern')
        await page.screenshot({
          path: `artifacts/settings-contrast-preferences-${mode}-390.png`,
          animations: 'disabled',
        });
      await page.locator('.settings-dialog .n-base-close').click();
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    expect([...kinds].sort()).toEqual(['autocomplete', 'number', 'select', 'text', 'time']);
    expect(state.writes).toEqual([]);
    expect(state.errors).toEqual([]);
    await info.attach('settings-controls-computed.json', {
      body: JSON.stringify(observations, null, 2),
      contentType: 'application/json',
    });
    await info.attach('resize-observer-notifications.json', {
      body: JSON.stringify(state.resizeNotifications),
      contentType: 'application/json',
    });
  });

test('dark focus, popup triggers and live system-mode changes keep settings scoped and geometry stable', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const state = await fixture(page);
  await open(page);
  const p = visualProfile('modern', true).palette;
  const number = page.locator('[data-preference="refreshIntervalMs"] .n-input');
  await number.scrollIntoViewIfNeeded();
  const initial = await number.boundingBox();
  await number.hover();
  await expect(number.locator('.n-input__state-border')).toHaveCSS(
    'border-top-color',
    cssRgb(p.accent),
  );
  await number.locator('input').focus();
  await expect(number.locator('.n-input__state-border')).toHaveCSS(
    'border-top-color',
    cssRgb(p.accent),
  );
  expect(await number.boundingBox()).toEqual(initial);
  const select = page.locator('[data-preference="locale"] .n-base-selection');
  const selectBox = await select.boundingBox();
  await select.hover();
  await expect(select.locator('.n-base-selection__state-border')).toHaveCSS(
    'border-top-color',
    cssRgb(p.accent),
  );
  await select.click();
  await expect(select).toHaveClass(/n-base-selection--active/);
  await expect(select.locator('.n-base-selection__state-border')).toHaveCSS(
    'border-top-color',
    cssRgb(p.accent),
  );
  expect(await select.boundingBox()).toEqual(selectBox);
  await page.locator('.settings-dialog > .n-card-header').click();
  const dialog = page.locator('.settings-dialog');
  await dialog.getByRole('checkbox', { name: 'Pagination', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Pagination', exact: true })).not.toBeChecked();
  const disabledSelect = page.locator('[data-preference="pageSize"] .n-base-selection');
  await expect(disabledSelect).toHaveClass(/n-base-selection--disabled/);
  await expect(disabledSelect.locator('.n-base-selection-label')).toHaveCSS(
    'background-color',
    cssRgb(p.canvas),
  );
  await expect(disabledSelect.locator('.n-base-selection__border')).toHaveCSS(
    'border-top-color',
    cssRgb(p.muted),
  );
  await expect(disabledSelect.locator('.n-base-selection-input')).toHaveCSS(
    'color',
    cssRgb(p.muted),
  );
  await dialog.getByRole('checkbox', { name: 'Automatic refresh', exact: true }).click();
  await expect(
    dialog.getByRole('checkbox', { name: 'Automatic refresh', exact: true }),
  ).not.toBeChecked();
  await expect(number.locator('input')).toBeDisabled();
  await expect(number).toHaveCSS('background-color', cssRgb(p.canvas));
  await expect(number.locator('.n-input__border')).toHaveCSS('border-top-color', cssRgb(p.muted));
  await dialog.getByRole('checkbox', { name: 'Pagination', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Pagination', exact: true })).toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Automatic refresh', exact: true }).click();
  await expect(
    dialog.getByRole('checkbox', { name: 'Automatic refresh', exact: true }),
  ).toBeChecked();
  await choose(page, 'Schedule');
  await page.locator('[data-setting="alt-speed-time-enabled"]').getByRole('checkbox').check();
  const time = page.locator('[data-setting="alt-speed-time-begin"] .n-input');
  await time.locator('input').focus();
  await expect(time.locator('.n-input__state-border')).toHaveCSS(
    'border-top-color',
    cssRgb(p.accent),
  );
  await page.locator('.settings-dialog > .n-card-header').click();
  await choose(page, 'User labels');
  await page.locator('.settings-label-row .n-color-picker').click();
  await expect(page.locator('.n-color-picker-panel')).toBeVisible();
  const colors = await frames(page, '.n-color-picker-panel');
  expect(colors.length).toBeGreaterThan(0);
  for (const f of colors) {
    expect(contrast(f.border, f.background)).toBeGreaterThanOrEqual(3);
    expect(contrast(f.text, f.background)).toBeGreaterThanOrEqual(4.5);
  }
  await page.locator('.settings-dialog > .n-card-header').click();
  await choose(page, 'Basic settings');
  const light = visualProfile('modern', false).palette;
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(number.locator('.n-input__border')).toHaveCSS(
    'border-top-color',
    cssRgb(light.border),
  );
  await expect(number).toHaveCSS('background-color', cssRgb(light.surface));
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(number.locator('.n-input__border')).toHaveCSS('border-top-color', cssRgb(p.muted));
  await expect(number).toHaveCSS('background-color', cssRgb(p.subtle));
  expect(state.writes).toEqual([]);
  expect(state.errors).toEqual([]);
  await test.info().attach('resize-observer-notifications.json', {
    body: JSON.stringify(state.resizeNotifications),
    contentType: 'application/json',
  });
});
