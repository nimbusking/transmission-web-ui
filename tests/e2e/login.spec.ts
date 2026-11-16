import { expect, test } from '@playwright/test';

test('minimal login retries credentials, supports narrow/dark layouts and enters the workspace', async ({
  page,
}) => {
  let accepted = false;
  await page.route('**/rpc', async (route) => {
    const request = route.request();
    if (
      request.headers().authorization !== `Basic ${Buffer.from('demo:correct').toString('base64')}`
    ) {
      await route.fulfill({
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Transmission"' },
        body: '',
      });
      return;
    }
    accepted = true;
    const body = request.postDataJSON();
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? { version: '4.0.6', 'rpc-version': 17 }
            : body.method === 'torrent-get'
              ? { torrents: [] }
              : {},
      },
    });
  });
  await page.goto('/?lang=zh-CN');
  await expect(page.locator('.login-page')).toBeVisible();
  await expect(page.getByLabel('用户名', { exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/login-home.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByLabel('用户名', { exact: true }).fill('demo');
  await page.getByLabel('密码', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('登录失败');
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '切换到深色模式' }).click();
  await expect(page.locator('.application')).toHaveClass(/dark/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.login-submit')).toHaveCSS('background-color', 'rgb(72, 214, 189)');
  await page.screenshot({
    path: 'test-results/login-mobile-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '切换到浅色模式' }).click();
  await expect(page.locator('.login-submit')).toHaveCSS('background-color', 'rgb(17, 124, 110)');
  await page.screenshot({
    path: 'test-results/login-desktop-light.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByLabel('密码', { exact: true }).fill('correct');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.locator('.workspace')).toBeVisible();
  await expect(page.locator('.login-page')).toHaveCount(0);
  expect(accepted).toBe(true);
});

test('default entry waits for explicit sign-in even without server authentication', async ({
  page,
}) => {
  let rpcCalls = 0;
  await page.route('**/rpc', async (route) => {
    rpcCalls++;
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : body.method === 'torrent-get'
              ? { torrents: [] }
              : {},
      },
    });
  });
  await page.clock.install();
  await page.goto('/?lang=zh-CN');
  await expect(page.getByLabel('用户名', { exact: true })).toBeEnabled();
  await expect(page.locator('.login-page')).toBeVisible();
  await expect(page.locator('.workspace')).toHaveCount(0);
  await page.clock.fastForward(15000);
  await expect(page.locator('.login-page')).toBeVisible();
  await expect(page.locator('.workspace')).toHaveCount(0);
  expect(rpcCalls).toBe(0);
  await page.getByLabel('用户名', { exact: true }).fill('demo');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.locator('.workspace')).toBeVisible();
});
