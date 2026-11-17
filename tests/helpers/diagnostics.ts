import { runReplay } from '../../scripts/lib/run-replay.mjs';
import { expect, type Browser, type TestInfo } from '@playwright/test';
export async function offlineReplay(
  browser: Browser,
  packet: unknown,
  testInfo: TestInfo,
  candidate = false,
  expected?: Record<string, unknown>,
  target = '/replay.html',
) {
  const raw = JSON.stringify(packet);
  const targetUrl = new URL(target, String(testInfo.project.use.baseURL));
  const context = await browser.newContext();
  const replayPage = await context.newPage();
  let realRpc = 0;
  await replayPage.route('**/*', async (route) => {
    const request = route.request();
    if (
      new URL(request.url()).origin !== targetUrl.origin ||
      request.method() !== 'GET' ||
      !new URL(request.url()).pathname.match(/^(\/replay.html|\/assets\/|\/favicon)/)
    ) {
      realRpc++;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await replayPage.goto(targetUrl.href);
  await replayPage.waitForFunction(() => !!window.__replay);
  const timing = await replayPage.evaluate(
    ({ raw, candidate, expected }) => window.__replay.prepare(raw, candidate, expected),
    { raw, candidate, expected },
  );
  const report = await runReplay(replayPage, timing);
  await testInfo.attach('replay-report', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  expect(report, JSON.stringify(report)).toMatchObject({
    result: 'matched',
    remainingRpcEvents: [],
    realRpcRequests: 0,
    pending: 0,
  });
  expect(realRpc).toBe(0);
  await context.close();
  return report;
}
