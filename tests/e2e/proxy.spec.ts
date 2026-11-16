import { expect, test } from '@playwright/test';
for (const path of ['/ui/', '/nas/transmission/web/'])
  test(`same-origin proxy ${path} forwards resources and session negotiation`, async ({ page }) => {
    test.skip(process.env.TWUI_PROXY !== '1', 'Start the lab proxy profile and set TWUI_PROXY=1');
    const errors: string[] = [],
      statuses: number[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.url().includes('rpc')) statuses.push(response.status());
    });
    await page.goto(`http://127.0.0.1:19098${path}?lang=en#/torrents`);
    await expect(page.locator('.connection')).toContainText('Connected');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Basic settings', { exact: true })).toBeVisible();
    expect(statuses).toContain(409);
    expect(statuses).toContain(200);
    expect(errors).toEqual([]);
    expect(page.url()).toContain('?lang=en#/torrents');
  });
