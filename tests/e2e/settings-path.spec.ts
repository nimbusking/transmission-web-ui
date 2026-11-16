import { expect, test, type Page } from '@playwright/test';
async function fixture(page: Page) {
  const writes: unknown[] = [],
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'session-set') writes.push(body.arguments);
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? {
                version: '4.1.4',
                'rpc-version': 19,
                'download-dir': '/data',
                'config-dir': '/config',
                'incomplete-dir-enabled': false,
                'incomplete-dir': '/incomplete',
              }
            : body.method === 'torrent-get'
              ? {
                  torrents: ['/data/alpha', '/data/beta'].map((downloadDir, id) => ({
                    id: id + 1,
                    hashString: String(id + 1).repeat(40),
                    name: `Directory ${id}`,
                    downloadDir,
                    status: 0,
                  })),
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('.connection')).toContainText('Connected');
  return { writes, errors };
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.settings-path-input')).toBeVisible();
  await page.locator('.settings-dialog > .n-card-header').click();
  await expect(page.locator('.n-auto-complete-menu')).toHaveCount(0);
}
const inputName = 'Default path to download torrents:';
test('label text, stretched label whitespace and all four outside edges do not open suggestions', async ({
  page,
}) => {
  const state = await fixture(page);
  await open(page);
  const label = page.locator('[data-setting="download-dir"] > label'),
    input = page.getByRole('textbox', { name: inputName, exact: true }),
    menu = page.locator('.n-auto-complete-menu');
  const labelBox = (await label.boundingBox())!;
  for (const x of [5, labelBox.width - 5]) {
    await label.click({ position: { x, y: labelBox.height / 2 } });
    await expect(menu).toHaveCount(0);
    await expect(input).not.toBeFocused();
  }
  const box = (await page.locator('.settings-path-input').boundingBox())!;
  for (const [x, y] of [
    [box.x + box.width / 2, box.y - 3],
    [box.x + box.width / 2, box.y + box.height + 3],
    [box.x - 3, box.y + box.height / 2],
    [box.x + box.width + 3, box.y + box.height / 2],
  ]) {
    await page.mouse.click(x, y);
    await expect(menu).toHaveCount(0);
    await expect(input).not.toBeFocused();
  }
  await page.locator('.settings-path-input').click({ position: { x: 2, y: box.height / 2 } });
  await expect(menu).toBeVisible();
  await expect(input).toBeFocused();
  await page.locator('.settings-dialog > .n-card-header').click();
  await expect(menu).toHaveCount(0);
  expect(state.writes).toEqual([]);
  expect(state.errors).toEqual([]);
});
test('mouse selection, free text and keyboard focus/navigation preserve drafts without daemon writes', async ({
  page,
}) => {
  const state = await fixture(page);
  await open(page);
  const input = page.getByRole('textbox', { name: inputName, exact: true }),
    menu = page.locator('.n-auto-complete-menu');
  await input.click();
  await expect(menu).toBeVisible();
  await menu.getByText('/data/alpha', { exact: true }).click();
  await expect(input).toHaveValue('/data/alpha');
  await expect(menu).toHaveCount(0);
  await page.locator('.settings-dialog > .n-card-header').click();
  await input.focus();
  await expect(menu).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(input).toHaveValue('/data/beta');
  await expect(menu).toHaveCount(0);
  await input.fill('/custom/unlisted');
  await input.press('Tab');
  await expect(input).toHaveValue('/custom/unlisted');
  await expect(menu).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Save Transmission parameters', exact: true }),
  ).toBeEnabled();
  expect(state.writes).toEqual([]);
  expect(state.errors).toEqual([]);
});
const rgb = (css: string) =>
  css.startsWith('#')
    ? [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16))
    : css
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
function contrast(a: string, b: string) {
  const luminance = (css: string) =>
    rgb(css)
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
for (const mode of ['light', 'dark'] as const)
  test(`${mode}: four skins keep a visible path frame, correct focus and narrow-screen geometry`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
    const state = await fixture(page),
      results: unknown[] = [];
    for (const skin of ['Modern', 'Metro', 'Material', 'Cupertino']) {
      await page.getByRole('button', { name: 'Visual themes', exact: true }).click();
      await page.locator('.theme-dialog').getByRole('button', { name: skin, exact: true }).click();
      await expect(page.locator('.application')).toHaveAttribute(
        'data-visual-theme',
        skin.toLowerCase(),
      );
      await page.keyboard.press('Escape');
      await open(page);
      const field = page.locator('.settings-path-input .n-input');
      const target = await field.evaluate((el) =>
        getComputedStyle(el)
          .getPropertyValue('--n-border')
          .trim()
          .replace(/^1px\s+solid\s+/, ''),
      );
      await expect(field.locator('.n-input__border')).toHaveCSS(
        'border-top-color',
        `rgb(${rgb(target).join(', ')})`,
      );
      const metrics = await field.evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        panel: getComputedStyle(document.querySelector('.settings-dialog')!).backgroundColor,
        border: getComputedStyle(el.querySelector('.n-input__border')!).borderTopColor,
        text: getComputedStyle(el.querySelector('input')!).color,
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        ordinaryInput: getComputedStyle(
          document.querySelector('[data-setting="incomplete-dir"] .n-input')!,
        ).backgroundColor,
      }));
      if (mode === 'dark') {
        expect(metrics.background).not.toBe(metrics.panel);
        expect(contrast(metrics.border, metrics.background)).toBeGreaterThanOrEqual(3);
        expect(contrast(metrics.border, metrics.panel)).toBeGreaterThanOrEqual(3);
        expect(contrast(metrics.text, metrics.background)).toBeGreaterThanOrEqual(4.5);
      } else {
        const colors = await field.evaluate((el) => ({
          path: getComputedStyle(el).getPropertyValue('--n-color').trim(),
          ordinary: getComputedStyle(
            document.querySelector('[data-setting="incomplete-dir"] .n-input')!,
          )
            .getPropertyValue('--n-color')
            .trim(),
        }));
        expect(colors.path).toBe(colors.ordinary);
      }
      const before = await field.boundingBox();
      await field.hover();
      if (mode === 'dark')
        await expect(field.locator('.n-input__state-border')).toHaveCSS(
          'border-top-color',
          `rgb(${rgb(metrics.accent).join(', ')})`,
        );
      await page.getByRole('textbox', { name: inputName, exact: true }).focus();
      await expect(field).toHaveClass(/n-input--focus/);
      if (mode === 'dark')
        await expect(field.locator('.n-input__state-border')).toHaveCSS(
          'border-top-color',
          `rgb(${rgb(metrics.accent).join(', ')})`,
        );
      expect(await field.boundingBox()).toEqual(before);
      await page.locator('.settings-dialog > .n-card-header').click();
      await page.setViewportSize({ width: 390, height: 800 });
      await expect(field).toBeInViewport({ ratio: 1 });
      await expect
        .poll(() =>
          page.locator('.settings-dialog').evaluate((el) => el.scrollWidth - el.clientWidth),
        )
        .toBeLessThanOrEqual(2);
      if (info.project.name === 'chromium' && skin === 'Modern')
        await page.screenshot({
          path: `artifacts/settings-path-${mode}-390.png`,
          animations: 'disabled',
        });
      await page.setViewportSize({ width: 1280, height: 800 });
      if (info.project.name === 'chromium' && skin === 'Modern')
        await page.screenshot({
          path: `artifacts/settings-path-${mode}-1280.png`,
          animations: 'disabled',
        });
      await page.locator('.settings-dialog .n-base-close').click();
      results.push({ skin, ...metrics });
    }
    expect(state.writes).toEqual([]);
    expect(state.errors).toEqual([]);
    await info.attach('settings-path-appearance.json', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });
  });
