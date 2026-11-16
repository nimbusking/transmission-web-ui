import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { en, zh } from '../../src/i18n/messages';
async function connect(page: import('@playwright/test').Page) {
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        result: 'success',
        arguments:
          body.method === 'session-get'
            ? { version: '4.0.6', 'rpc-version': 17 }
            : body.method === 'torrent-get'
              ? { torrents: [] }
              : {},
        tag: body.tag,
      },
    });
  });
}
test('all 16 locales load safely and missing new text falls back to English', async ({ page }) => {
  await connect(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const language of [
    'en',
    'zh-CN',
    'zh-TW',
    'de',
    'es',
    'fr',
    'it',
    'ko',
    'nl',
    'hu',
    'pl',
    'pt-BR',
    'pt-PT',
    'ro',
    'ru',
    'uk',
  ]) {
    const messages =
      language === 'en'
        ? en
        : language === 'zh-CN'
          ? zh
          : JSON.parse(await readFile(`src/i18n/locales/${language}.json`, 'utf8'));
    await page.goto(`/?lang=${language}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.all || en.all);
    expect(await page.locator('html').getAttribute('lang')).toBe(language);
    await expect(
      page.getByRole('button', { name: messages.settings || en.settings, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: messages.about || en.about, exact: true }).click();
    await expect(page.locator('.about-description')).toHaveText(
      messages.aboutDescription || en.aboutDescription,
    );
    await page.keyboard.press('Escape');
  }
  expect(errors).toEqual([]);
});
test('late language chunk cannot override a newer choice; dark preference survives reload', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await connect(page);
  await page.route('**/de-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
  });
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Automatic', { exact: true }).click();
  await page.getByText('Deutsch', { exact: true }).click();
  await page
    .locator('.n-base-selection')
    .filter({ hasText: /^Deutsch$/ })
    .click();
  await page.locator('.n-base-select-menu').hover();
  await page.mouse.wheel(0, -500);
  await page.getByText('简体中文', { exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('全部任务');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '切换到深色模式', exact: true }).click();
  await expect(page.locator('.application')).toHaveClass(/dark/);
  await page.waitForTimeout(2200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('全部任务');
  await page.goto('/');
  await expect(page.locator('.application')).toHaveClass(/dark/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('全部任务');
});
