import { readFile } from 'node:fs/promises';
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

test('tab login survives reload, rejects expired credentials and does not persist failed login', async ({
  page,
  browser,
}) => {
  let validPassword = 'correct';
  let delayAuthentication = false;
  await page.addInitScript(() => {
    (window as any).__loginSeenDuringRestore = false;
    new MutationObserver(() => {
      if (document.querySelector('.login-page, .session-loading'))
        (window as any).__loginSeenDuringRestore = true;
    }).observe(document, { childList: true, subtree: true });
  });
  const installRpc = async (target: typeof page) => {
    await target.route('**/rpc', async (route) => {
      if (
        route.request().headers().authorization !==
        `Basic ${Buffer.from(`demo:${validPassword}`).toString('base64')}`
      ) {
        await route.fulfill({ status: 401, body: '' });
        return;
      }
      const body = route.request().postDataJSON();
      if (delayAuthentication && body.method === 'session-get')
        await new Promise((resolve) => setTimeout(resolve, 1200));
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
  };
  await installRpc(page);
  await page.goto('/?lang=zh-CN');
  await page.getByLabel('用户名', { exact: true }).fill('demo');
  await page.getByLabel('密码', { exact: true }).fill('correct');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.locator('.workspace')).toBeVisible();
  // Simulate a session saved by 2.1.1/2.1.2 before page-to-endpoint markers existed.
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith('twui:login-page:')) sessionStorage.removeItem(key);
  });
  delayAuthentication = true;
  const restoredResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc') &&
      response.request().postDataJSON()?.method === 'session-get',
  );
  let restoredFinished = false;
  void restoredResponse.then(() => {
    restoredFinished = true;
  });
  await page.reload();
  await expect(page.locator('.workspace')).toBeVisible();
  expect(restoredFinished).toBe(false);
  expect(await page.evaluate(() => (window as any).__loginSeenDuringRestore)).toBe(false);
  await expect(page.locator('.login-page')).toHaveCount(0);
  await restoredResponse;
  await expect(page.locator('.workspace').locator('..')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.workspace')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__loginSeenDuringRestore)).toBe(false);
  delayAuthentication = false;
  await expect(page.locator('.login-page')).toHaveCount(0);
  // A fresh browsing session must not inherit the login.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await installRpc(other);
  await other.goto(new URL('/?lang=zh-CN', page.url()).href);
  await expect(other.locator('.login-page')).toBeVisible();
  await fresh.close();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith('twui:login-session:')),
    ),
  ).toBe(false);
  validPassword = 'changed';
  await page.reload();
  await expect(page.locator('.login-page')).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) => k.startsWith('twui:login-session:')),
    ),
  ).toEqual([]);
  await page.getByLabel('用户名', { exact: true }).fill('demo');
  await page.getByLabel('密码', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('登录失败');
  await page.locator('.diagnostics-panel summary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前日志 / Export', exact: true }).click();
  const download = await downloadPromise;
  const exported = await readFile((await download.path())!, 'utf8');
  expect(exported).not.toContain('demo:correct');
  expect(exported).not.toContain(Buffer.from('demo:correct').toString('base64'));
  expect(exported).not.toContain('"password"');

  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) => k.startsWith('twui:login-session:')),
    ),
  ).toEqual([]);
});
