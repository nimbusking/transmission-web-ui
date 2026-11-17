import { test, expect } from '@playwright/test';
test('another tab changing settings invalidates the enhanced recording', async ({
  page,
  context,
}) => {
  await context.route('**/rpc', (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
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
  await page.goto('/replay.html');
  await page.waitForFunction(() => !!window.__replay);
  await page.evaluate(async () => {
    await window.__replay.initialize();
    await window.__replay.start();
  });
  const other = await context.newPage();
  await other.goto('/replay.html');
  await other.waitForFunction(() => !!window.__replay);
  await other.evaluate(() => window.__replay.initialize(true));
  // BroadcastChannel delivery crosses browser event loops and is asynchronous.
  await page.waitForTimeout(100);
  const packet = await page.evaluate(() => window.__replay.stop());
  expect(packet.capture.eligibility).toBe('ineligible');
  expect(packet.capture.reasons).toContain('external-change');
});
