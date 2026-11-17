import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const failure of ['blocked', 'quota']) {
  test(`diagnostic storage ${failure} preserves login and allows memory export`, async ({
    page,
  }) => {
    await page.addInitScript((failure) => {
      const original = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (name, version) {
        if (name === 'transmission-web-ui-diagnostics')
          throw new DOMException(
            'Test failure',
            failure === 'quota' ? 'QuotaExceededError' : 'SecurityError',
          );
        return original.call(this, name, version!);
      };
    }, failure);
    await page.route('**/rpc', (route) => route.fulfill({ status: 401 }));
    await page.goto('/?lang=zh-CN');
    await expect(page.getByLabel('用户名', { exact: true })).toBeEnabled();
    await page.getByLabel('用户名', { exact: true }).fill('CANARY-USER');
    await page.getByLabel('密码', { exact: true }).fill('CANARY-PASS');
    await page.getByRole('button', { name: '进入工作台', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.locator('.diagnostics-panel summary').click();
    await expect(page.locator('.diagnostics-panel')).toContainText('内存模式');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出当前日志 / Export', exact: true }).click();
    const raw = await readFile((await (await download).path())!, 'utf8');
    expect(raw).not.toContain('CANARY');
    expect(JSON.parse(raw).events.some((event: any) => event.type === 'rpc.error')).toBe(true);
  });
}

test('module failure offers independent startup export', async ({ page }) => {
  await page.clock.install();
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.goto('/');
  await page.clock.runFor(15001);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export diagnostics / 导出诊断' }).click();
  const packet = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(packet.capture).toMatchObject({ mode: 'startup', eligibility: 'diagnostic-only' });
  expect(packet.events.length).toBeGreaterThan(0);
});

test('language chunk failure falls back and remains diagnosable', async ({ page }) => {
  await page.route('**/de-*.js', (route) => route.abort());
  await page.goto('/?lang=de');
  await expect(page.locator('.login-page')).toBeVisible();
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
  await page.locator('.diagnostics-panel summary').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前日志 / Export', exact: true }).click();
  expect(
    JSON.parse(await readFile((await (await download).path())!, 'utf8')).capture.eligibility,
  ).toBe('diagnostic-only');
});

test('Vue lifecycle exception remains manually exportable without leaking its message', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = original(query);
      media.addEventListener = () => {
        throw new ReferenceError('CANARY-VUE-MESSAGE');
      };
      return media;
    };
  });
  await page.goto('/?lang=zh-CN');
  await page.locator('.diagnostics-panel summary').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前日志 / Export', exact: true }).click();
  const raw = await readFile((await (await download).path())!, 'utf8');
  expect(raw).not.toContain('CANARY');
  expect(
    JSON.parse(raw).events.some(
      (event: any) => event.type === 'runtime.error' && event.data.source === 'initialization',
    ),
  ).toBe(true);
});
