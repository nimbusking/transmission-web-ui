import { offlineReplay } from '../helpers/diagnostics';
import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

async function fixture(page: Page, scenario: string) {
  let armed = false;
  let negotiated = false;
  let status = 4;
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (armed && body.method === 'torrent-stop') {
      if (scenario === '409-exhausted' || (scenario === '409' && !negotiated)) {
        negotiated = true;
        await route.fulfill({
          status: 409,
          headers: { 'X-Transmission-Session-Id': 'PRIVATE-SESSION' },
        });
        return;
      }
      if (scenario === 'timeout') {
        status = 0;
        return;
      }
      if (scenario === 'mixed' && body.arguments.ids[0] === 'b'.repeat(40)) {
        await route.fulfill({ status: 403 });
        return;
      }
      if (scenario === 'network') {
        await route.abort('failed');
        return;
      }
      if (scenario === '401') {
        await route.fulfill({ status: 401 });
        return;
      }
      if (scenario === 'json') {
        await route.fulfill({ status: 200, body: 'PRIVATE-malformed{' });
        return;
      }
      status = 0;
    }
    const torrent = {
      id: 91,
      hashString: 'a'.repeat(40),
      name: 'PRIVATE-name',
      downloadDir: '/PRIVATE/path',
      status,
      totalSize: 1000,
      percentDone: 0.25,
      error: 0,
      errorString: '',
      trackers: [],
      trackerStats: [],
    };
    const args =
      body.method === 'session-get'
        ? { version: '4.0.6', 'rpc-version': 17, 'session-id': 'PRIVATE-SESSION' }
        : body.method === 'torrent-get'
          ? {
              torrents: [
                Object.fromEntries(
                  body.arguments.fields
                    .filter((key: string) => key in torrent)
                    .map((key: string) => [key, torrent[key as keyof typeof torrent]]),
                ),
              ],
            }
          : {};
    if (armed && scenario === 'missing' && body.method === 'torrent-get') {
      await route.fulfill({ json: { result: 'success', tag: body.tag, arguments: {} } });
      return;
    }
    await route.fulfill({
      json: {
        result: 'success',
        tag:
          armed && scenario === 'tag' && body.method === 'torrent-stop' ? body.tag + 999 : body.tag,
        arguments: args,
      },
    });
  });
  await page.goto('/replay.html');
  await page.waitForFunction(() => !!window.__replay);
  await page.evaluate(async (auto) => {
    await window.__replay.initialize(auto);
    await window.__replay.start();
  }, scenario === 'auto');
  armed = true;
}

for (const scenario of [
  '409',
  '409-exhausted',
  'network',
  '401',
  'json',
  'tag',
  'missing',
  'timeout',
  'success',
  'auto',
]) {
  test(`record/export/import/offline real-store replay: ${scenario}`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(45000);
    await fixture(page, scenario);
    await page.evaluate(() =>
      window.__replay.action({ action: 'execute', method: 'torrent-stop', ids: [91] }),
    );
    if (scenario === 'auto') await page.waitForTimeout(5100);
    const packet = await page.evaluate(() => window.__replay.stop());
    expect(packet.capture.eligibility).toBe('replayable');
    const raw = JSON.stringify(packet);
    expect(raw).not.toContain('PRIVATE');
    await mkdir('artifacts/diagnostics-replay', { recursive: true });
    await writeFile(`artifacts/diagnostics-replay/${testInfo.project.name}-${scenario}.json`, raw);
    const report = await offlineReplay(browser, packet, testInfo);
    if (
      scenario === 'success' ||
      scenario === '409' ||
      scenario === 'timeout' ||
      scenario === 'auto'
    )
      expect(report.actual.torrents[0].status).toBe(0);
    else if (scenario === 'missing') expect(report.actual.stale).toBe(true);
    else expect(report.actual.results[0].status).toBe(scenario === '401' ? 'failed' : 'unknown');
  });
}
