import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { defaultSettings } from '../../src/domain/torrents';
test('5000 tasks, 20 columns, 500 changes/2s and aligned-GC soak', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium' || process.env.TWUI_SOAK !== '1',
    'Explicit Chromium performance acceptance run',
  );
  const duration = Number(process.env.TWUI_SOAK_SECONDS || 1800);
  expect(duration).toBeGreaterThanOrEqual(60);
  test.setTimeout((duration + 180) * 1000);
  const settings = defaultSettings();
  settings.ui.locale = 'en';
  settings.ui.refreshIntervalMs = 2000;
  settings.ui.columns = settings.ui.columns.map((column, index) => ({
    ...column,
    visible: index < 20,
  }));
  await page.addInitScript(async (preferences) => {
    const ready = new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('transmission-web-ui', 2);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('data')) open.result.createObjectStore('data');
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result,
          tx = db.transaction('data', 'readwrite');
        tx.objectStore('data').put(preferences, `${location.origin}/rpc:settings`);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
    const original = window.fetch.bind(window);
    (window as any).__timings = [];
    window.fetch = async (...args) => {
      await ready;
      const response = await original(...args);
      if (args[1]?.body && JSON.parse(String(args[1].body)).method === 'torrent-get') {
        const json = response.json.bind(response);
        response.json = async () => {
          const data = await json(),
            received = performance.now();
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              (window as any).__timings.push({
                count: data.arguments.torrents.length,
                ms: performance.now() - received,
              }),
            ),
          );
          return data;
        };
      }
      return response;
    };
  }, settings);
  const rows = Array.from({ length: 5000 }, (_, id) => ({
    id,
    hashString: id.toString(16).padStart(40, '0'),
    name: `Performance ${String(id).padStart(5, '0')}`,
    downloadDir: '/data',
    status: 4,
    percentDone: 0.5,
    totalSize: 100000,
    leftUntilDone: 50000,
    rateDownload: 100,
    rateUpload: 0,
    uploadedEver: 0,
    downloadedEver: 50000,
    queuePosition: id,
    uploadRatio: 0,
    trackers: [],
    trackerStats: [],
    addedDate: 1700000000,
    metadataPercentComplete: 1,
  }));
  let cycle = 0,
    updates = 0;
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    let args = {};
    if (body.method === 'session-get')
      args = { version: '4.0.6', 'rpc-version': 17, 'session-id': 'soak' };
    if (body.method === 'torrent-get') {
      if (body.arguments.ids === 'recently-active') {
        const change = Array.from({ length: 500 }, (_, offset) => {
          const row = rows[(cycle * 500 + offset) % 5000];
          row.rateDownload = 100 + cycle;
          row.percentDone = (cycle % 100) / 100;
          return { id: row.id, rateDownload: row.rateDownload, percentDone: row.percentDone };
        });
        cycle++;
        updates++;
        args = { torrents: change };
      } else args = { torrents: rows };
    }
    await route.fulfill({ json: { result: 'success', arguments: args, tag: body.tag } });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lang=en');
  await expect(page.locator('.section-title')).toContainText('5000 transfers');
  await expect(page.locator('[data-torrent-id]').first()).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
  // Warm up lazy rendering and the first incremental update before the aligned baseline.
  await page.waitForTimeout(5000);
  const sorts: number[] = [],
    filters: number[] = [];
  for (let i = 0; i < 20; i++) {
    sorts.push(
      await page.evaluate(async () => {
        const begin = performance.now();
        document.querySelector<HTMLButtonElement>('.column-sort')!.click();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return performance.now() - begin;
      }),
    );
    filters.push(
      await page.evaluate(
        async (query) => {
          const input = document.querySelector<HTMLInputElement>('.search-input input')!,
            begin = performance.now();
          const settled = new Promise<void>((resolve) => {
            const observer = new MutationObserver(() => {
              if (
                document
                  .querySelector('.section-title')!
                  .textContent!.includes(query ? '1 transfers' : '5000 transfers')
              ) {
                observer.disconnect();
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
              }
            });
            observer.observe(document.querySelector('.section-title')!, {
              subtree: true,
              childList: true,
              characterData: true,
            });
          });
          input.value = query;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await settled;
          return performance.now() - begin;
        },
        i % 2 === 0 ? 'Performance 04999' : '',
      ),
    );
  }
  const baseline = await heap(),
    start = Date.now(),
    samples = [{ seconds: 0, bytes: baseline }];
  await mkdir('artifacts', { recursive: true });
  while (Date.now() - start < duration * 1000) {
    await page.waitForTimeout(Math.min(30000, duration * 1000 - (Date.now() - start)));
    samples.push({ seconds: (Date.now() - start) / 1000, bytes: await heap() });
    await writeFile(
      'artifacts/soak-progress.json',
      JSON.stringify({ duration, updates, samples }, null, 2),
    );
    if (samples.length % 2 === 1)
      console.log(
        `Soak ${samples.at(-1)!.seconds.toFixed(0)}s: ${(samples.at(-1)!.bytes / 1048576).toFixed(1)} MiB, ${updates} incremental updates`,
      );
  }
  const timings = await page.evaluate(
    () => (window as any).__timings as { count: number; ms: number }[],
  );
  const p95 = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
  const result = {
    at: new Date().toISOString(),
    durationSeconds: duration,
    fullThirtyMinutes: duration >= 1800,
    columns: 20,
    tasks: 5000,
    changesPerCycle: 500,
    intervalMs: 2000,
    updates,
    initialMs: timings.find((x) => x.count === 5000)?.ms,
    incrementalP95Ms: p95(timings.filter((x) => x.count === 500).map((x) => x.ms)),
    sortP95Ms: p95(sorts),
    filterP95IncludingDebounceMs: p95(filters),
    filterP95ExcludingConfiguredDebounceMs: p95(filters) - 120,
    heapMaxBytes: Math.max(...samples.map((x) => x.bytes)),
    heapGrowthBytes: samples.at(-1)!.bytes - baseline,
    samples,
    errors,
    measurement:
      'JSON parsed to two animation frames; filtering includes native input, configured 120ms debounce and two frames; heap samples after explicit CDP GC',
  };
  await writeFile(`artifacts/soak-${duration}.json`, JSON.stringify(result, null, 2));
  expect(errors).toEqual([]);
  expect(result.initialMs).toBeLessThanOrEqual(1000);
  expect(result.incrementalP95Ms).toBeLessThanOrEqual(150);
  expect(result.sortP95Ms).toBeLessThanOrEqual(200);
  expect(result.filterP95ExcludingConfiguredDebounceMs).toBeLessThanOrEqual(200);
  expect(result.heapMaxBytes).toBeLessThanOrEqual(200 * 1048576);
  expect(result.heapGrowthBytes).toBeLessThanOrEqual(20 * 1048576);
});
