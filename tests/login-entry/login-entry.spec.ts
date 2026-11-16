import { test, expect } from '@playwright/test';
test('real nginx entry renders login before authentication and retries against Transmission', async ({
  page,
}) => {
  const response = await page.goto('/transmission/web/?lang=zh-CN');
  expect(response?.status()).toBe(200);
  await expect(page.locator('.login-page')).toBeVisible();
  await page.getByLabel('用户名', { exact: true }).fill('lab');
  await page.getByLabel('密码', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('登录失败');
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('');
  await page.screenshot({ path: 'artifacts/login-entry-error.png' });
  await page.getByLabel('密码', { exact: true }).fill('lab-only-password');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.locator('.workspace')).toBeVisible();
  await expect(page.locator('.login-page')).toHaveCount(0);
});
