import { test, expect } from '@playwright/test';
test('real nginx entry renders login before authentication and retries against Transmission', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).__loginSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('.login-page, .session-loading'))
        (window as any).__loginSeen = true;
    }).observe(document, { childList: true, subtree: true });
  });
  const response = await page.goto('/transmission/web/?lang=zh-CN');
  expect(response?.status()).toBe(200);
  await expect(page.locator('.login-page')).toBeVisible();
  await page.getByLabel('用户名', { exact: true }).fill('lab');
  await page.getByLabel('密码', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('登录失败');
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('');

  await page.getByLabel('密码', { exact: true }).fill('lab-only-password');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.locator('.workspace')).toBeVisible();
  await expect(page.locator('.login-page')).toHaveCount(0);
  await page.route('**/transmission/rpc', async (route) => {
    if (route.request().postDataJSON()?.method === 'session-get')
      await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  for (let i = 0; i < 3; i++) {
    const restored = page.waitForResponse(
      (response) =>
        response.url().endsWith('/transmission/rpc') &&
        response.request().postDataJSON()?.method === 'session-get' &&
        response.status() === 200,
    );
    let restoredFinished = false;
    void restored.then(() => {
      restoredFinished = true;
    });
    if (i === 1) await page.goto('/transmission/web/?lang=zh-CN&login=1');
    else await page.reload();
    await expect(page.locator('.workspace')).toBeVisible();
    expect(restoredFinished).toBe(false);
    await expect(page.locator('.session-loading')).toHaveCount(0);
    await restored;
    await expect(page.locator('.workspace').locator('..')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.workspace')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__loginSeen)).toBe(false);
  }
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((k) => k.startsWith('twui:login-session:'))!;
    sessionStorage.setItem(key, JSON.stringify({ username: 'lab', password: 'expired-test' }));
  });
  await page.reload();
  await expect(page.locator('.login-page')).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) => k.startsWith('twui:login-session:')),
    ),
  ).toEqual([]);
});

test('blocked session storage keeps explicit login functional with real RPC', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/transmission/web/?lang=zh-CN');
  await page.getByLabel('用户名', { exact: true }).fill('lab');
  await page.getByLabel('密码', { exact: true }).fill('lab-only-password');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.locator('.workspace')).toBeVisible();
  await page.reload();
  await expect(page.locator('.login-page')).toBeVisible();
  await expect(page.locator('.session-loading')).toHaveCount(0);
});
