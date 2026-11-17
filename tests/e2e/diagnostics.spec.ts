import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('manual diagnostic export excludes login credentials and identifies its limited eligibility', async ({
  page,
}) => {
  await page.route('**/rpc', (route) => route.fulfill({ status: 401 }));
  await page.goto('/?lang=zh-CN');
  await expect(page.getByLabel('用户名', { exact: true })).toBeEnabled();
  await page.getByLabel('用户名', { exact: true }).fill('CANARY-USER');
  await page.getByLabel('密码', { exact: true }).fill('CANARY-PASSWORD');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.locator('.diagnostics-panel summary').click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前日志 / Export', exact: true }).click();
  const path = await (await downloaded).path();
  const raw = await readFile(path!, 'utf8');
  expect(raw).not.toContain('CANARY');
  const packet = JSON.parse(raw);
  expect(packet.capture.eligibility).toBe('diagnostic-only');
  expect(packet.events.some((event: { type: string }) => event.type === 'rpc.error')).toBe(true);
});
