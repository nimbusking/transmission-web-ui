import { expect, test, type Page } from '@playwright/test';

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
                  torrents: [
                    {
                      id: 1,
                      hashString: 'a'.repeat(40),
                      name: 'Dialog fixture',
                      status: 0,
                      downloadDir: '/data',
                    },
                  ],
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeEnabled();
  return calls;
}

for (const theme of ['light', 'dark'] as const)
  test(`${theme}: lazy controls survive close, Escape and mask with focus restored`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    const calls = await fixture(page);
    const trigger = page.getByRole('button', { name: 'Columns', exact: true });
    const dialog = page.locator('.column-settings-dialog');
    await expect(page.locator('.column-setting')).toHaveCount(0);
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(page.locator('.column-setting')).toHaveCount(23);
    await expect(dialog.getByRole('checkbox', { name: 'Name', exact: true })).toBeFocused();
    const retained = await page.locator('.column-setting').first().elementHandle();
    for (const method of ['close', 'Escape', 'mask']) {
      if (method === 'close')
        await dialog.getByRole('button', { name: 'close', exact: true }).click();
      else if (method === 'Escape') await page.keyboard.press('Escape');
      else await page.mouse.click(2, 2);
      await expect(dialog).toBeHidden();
      await expect(page.locator('.n-modal-mask')).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await retained!.evaluate((node) => node.isConnected)).toBe(true);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await trigger.click();
      await expect(dialog).toBeVisible();
      expect(
        await retained!.evaluate((node) => node === document.querySelector('.column-setting')),
      ).toBe(true);
      await expect(page.locator('.column-setting')).toHaveCount(23);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // The retained hidden modal must not interfere with another modal's focus trap.
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      calls.filter((method) => !['session-get', 'session-stats', 'torrent-get'].includes(method)),
    ).toEqual([]);
  });

test('short opacity-only transitions apply to card and mask, including leave', async ({
  page,
}, testInfo) => {
  await fixture(page);
  await page.evaluate(() => {
    (window as any).columnTransitions = [];
    document.addEventListener('transitionrun', (event) => {
      const node = event.target as HTMLElement;
      if (!node.matches('.column-settings-dialog, .n-modal-mask')) return;
      const style = getComputedStyle(node);
      (window as any).columnTransitions.push({
        card: node.matches('.column-settings-dialog'),
        leave: node.className.includes('leave-active'),
        property: (event as TransitionEvent).propertyName,
        duration: style.transitionDuration,
        transform: style.transform,
        maskScope: node.matches('.n-modal-container:has(.column-settings-dialog) > .n-modal-mask'),
      });
    });
  });
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  const dialog = page.locator('.column-settings-dialog');
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).columnTransitions.length))
    .toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).columnTransitions.some((x: any) => x.card && x.leave)),
    )
    .toBe(true);
  const transitions = await page.evaluate(() => (window as any).columnTransitions);
  await testInfo.attach('column-transitions.json', {
    body: JSON.stringify(transitions, null, 2),
    contentType: 'application/json',
  });
  expect(transitions.length).toBeGreaterThanOrEqual(4);
  for (const entry of transitions) {
    expect(entry.duration, JSON.stringify(entry)).toBe('0.12s');
    expect(entry.property).toBe('opacity');
    if (entry.card) expect(entry.transform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  }
});

test('reduced motion removes transitions and narrow screen remains contained', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 720 });
  await fixture(page);
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  const dialog = page.locator('.column-settings-dialog');
  await expect(dialog).toBeVisible();
  const styles = await dialog.evaluate((node) => {
    const rule = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .find(
        (rule) =>
          rule instanceof CSSMediaRule &&
          rule.conditionText.includes('prefers-reduced-motion') &&
          rule.cssText.includes('column-settings-dialog'),
      );
    return { rule: rule?.cssText, rect: node.getBoundingClientRect().toJSON(), width: innerWidth };
  });
  expect(styles.rule).toContain('0ms');
  expect(styles.rect.left).toBeGreaterThanOrEqual(0);
  expect(styles.rect.right).toBeLessThanOrEqual(styles.width);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
