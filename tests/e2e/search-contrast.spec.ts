import { expect, test, type Page } from '@playwright/test';
const skins = ['Modern', 'Metro', 'Material', 'Cupertino'];
async function fixture(page: Page) {
  const calls: string[] = [];
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
              ? {
                  torrents: [1, 2].map((id) => ({
                    id,
                    hashString: String(id).repeat(40),
                    name: id === 1 ? 'Alpha' : 'Beta',
                    downloadDir: '/data',
                    status: 0,
                  })),
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('[data-torrent-id="1"]')).toBeVisible();
  return calls;
}
async function choose(page: Page, name: string) {
  await page.getByRole('button', { name: 'Visual themes', exact: true }).click();
  await page.locator('.theme-dialog').getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.application')).toHaveAttribute(
    'data-visual-theme',
    name.toLowerCase(),
  );
  await page.keyboard.press('Escape');
}
function rgb(css: string) {
  return css.startsWith('#')
    ? [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16))
    : css
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
}
async function settledSearch(page: Page) {
  const field = page.locator('.search-input');
  const targets = await field.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      border: style
        .getPropertyValue('--n-border')
        .trim()
        .replace(/^1px\s+solid\s+/, ''),
      placeholder: style.getPropertyValue('--n-placeholder-color').trim(),
    };
  });
  // Child border/text transitions can outlive the skin attribute update.
  await expect(field.locator('.n-input__border')).toHaveCSS(
    'border-top-color',
    `rgb(${rgb(targets.border).join(', ')})`,
  );
  await expect(field.locator('.n-input__placeholder')).toHaveCSS(
    'color',
    `rgb(${rgb(targets.placeholder).join(', ')})`,
  );
}
function contrast(a: string, b: string) {
  const luminance = (css: string) =>
    rgb(css)
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
test('dark search has a visible default frame, readable placeholder and accent hover/focus in every skin', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const calls = await fixture(page),
    results: any[] = [];
  for (const name of skins) {
    await choose(page, name);
    await settledSearch(page);
    const search = page.locator('.search-input'),
      input = page.getByPlaceholder('Search names, separate keywords with spaces');
    const metrics = await search.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        panel: getComputedStyle(document.querySelector('.main-panel')!).backgroundColor,
        border: getComputedStyle(node.querySelector('.n-input__border')!).borderTopColor,
        placeholder: getComputedStyle(node.querySelector('.n-input__placeholder')!).color,
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        radius: style.borderRadius,
      };
    });
    expect(metrics.background).not.toBe(metrics.panel);
    expect(metrics.border).not.toBe('rgba(0, 0, 0, 0)');
    expect(contrast(metrics.border, metrics.background)).toBeGreaterThanOrEqual(3);
    expect(contrast(metrics.border, metrics.panel)).toBeGreaterThanOrEqual(3);
    expect(contrast(metrics.placeholder, metrics.background)).toBeGreaterThanOrEqual(4.5);
    expect(metrics.radius).toBe(
      { Modern: '6px', Metro: '0px', Material: '10px', Cupertino: '8px' }[name],
    );
    const accentRgb = `rgb(${rgb(metrics.accent).join(', ')})`,
      before = await search.boundingBox();
    await search.hover();
    await expect(search.locator('.n-input__state-border')).toHaveCSS('border-top-color', accentRgb);
    await input.focus();
    await expect(search).toHaveClass(/n-input--focus/);
    await expect(search.locator('.n-input__state-border')).toHaveCSS('border-top-color', accentRgb);
    expect(await search.boundingBox()).toEqual(before);
    await input.fill('Alpha');
    await expect(page.locator('[data-torrent-id="2"]')).toHaveCount(0);
    await expect(page.locator('[data-torrent-id="1"]')).toBeVisible();
    await input.clear();
    await expect(page.locator('[data-torrent-id="2"]')).toBeVisible();
    results.push({ name, ...metrics });
  }
  expect(
    calls.filter((method) => !['session-get', 'torrent-get', 'session-stats'].includes(method)),
  ).toEqual([]);
  await testInfo.attach('search-contrast.json', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
});
test('light input styling and narrow-screen geometry stay unchanged', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await fixture(page);
  for (const name of skins) {
    await choose(page, name);
    await settledSearch(page);
    const appearance = () =>
      page.locator('.search-input').evaluate((node) => ({
        background: getComputedStyle(node).backgroundColor,
        border: getComputedStyle(node.querySelector('.n-input__border')!).borderTopColor,
        radius: getComputedStyle(node).borderRadius,
      }));
    const original = await appearance();
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await expect(page.locator('.application')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
    await expect(page.locator('.application')).not.toHaveClass(/dark/);
    await expect.poll(appearance).toEqual(original);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const search = page.locator('.search-input'),
        box = (await search.boundingBox())!;
      expect(box.height).toBe(34);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  }
});
