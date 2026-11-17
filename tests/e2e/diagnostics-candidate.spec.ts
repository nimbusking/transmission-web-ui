import { runReplay } from '../../scripts/lib/run-replay.mjs';
import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { offlineReplay } from '../helpers/diagnostics';

test('controlled state defect is reproduced on original build and corrected by candidate', async ({
  page,
  browser,
}, info) => {
  let status = 4;
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'torrent-stop') status = 0;
    const row = {
      id: 1,
      hashString: 'a'.repeat(40),
      name: 'controlled-task',
      status,
      trackers: [],
      trackerStats: [],
    };
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? { version: '4.0.6', 'rpc-version': 17 }
            : body.method === 'torrent-get'
              ? {
                  torrents: [
                    Object.fromEntries(
                      body.arguments.fields
                        .filter((key: string) => key in row)
                        .map((key: string) => [key, (row as any)[key]]),
                    ),
                  ],
                }
              : {},
      },
    });
  });
  // Serve a separately compiled defective build without changing production source files.
  await page.route('**/assets/**', async (route) => {
    const name = new URL(route.request().url()).pathname;
    const file = resolve('artifacts/replay-fault-build', `.${name}`);
    await route.fulfill({
      body: await readFile(file),
      contentType: extname(file) === '.css' ? 'text/css' : 'text/javascript',
    });
  });
  await page.route('**/replay.html', async (route) =>
    route.fulfill({
      body: await readFile('artifacts/replay-fault-build/replay.html'),
      contentType: 'text/html',
    }),
  );
  await page.goto('/replay.html');
  await page.waitForFunction(() => !!window.__replay);
  await page.evaluate(async () => {
    await window.__replay.initialize();
    await window.__replay.start();
    await window.__replay.action({ action: 'execute', method: 'torrent-stop', ids: [1] });
  });
  const packet = await page.evaluate(() => window.__replay.stop());
  expect(packet.observed.torrents[0].status).toBe(4); // Defect: server confirmed 0, client kept 4.
  expect(packet.app.buildId).toBe('diagnostics-controlled-fault-v1');
  // Original-build replay uses the same compiled fault assets in a fresh context.
  const original = await browser.newContext();
  const originalPage = await original.newPage();
  await originalPage.route('**/*', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path !== '/replay.html' && !path.startsWith('/assets/')) {
      await route.abort();
      return;
    }
    await route.fulfill({
      body: await readFile(resolve('artifacts/replay-fault-build', `.${path}`)),
      contentType: path.endsWith('.html')
        ? 'text/html'
        : path.endsWith('.css')
          ? 'text/css'
          : 'text/javascript',
    });
  });
  await originalPage.goto('/replay.html');
  await originalPage.waitForFunction(() => !!window.__replay);
  const timing = await originalPage.evaluate(
    (raw) => window.__replay.prepare(raw),
    JSON.stringify(packet),
  );
  const before = await runReplay(originalPage, timing);
  expect(before.result).toBe('matched');
  expect(before.actual.torrents[0].status).toBe(4);
  await original.close();
  const corrected = structuredClone(packet.observed);
  corrected.torrents[0].status = 0;
  const after = await offlineReplay(browser, packet, info, true, corrected);
  expect(after.actual.torrents[0].status).toBe(0);
  expect(after.sourceBuildId).not.toBe(after.targetBuildId);
  await mkdir('artifacts/diagnostics-candidate', { recursive: true });
  await writeFile(
    `artifacts/diagnostics-candidate/${info.project.name}.json`,
    JSON.stringify({ packet, before, after }, null, 2),
  );
});
