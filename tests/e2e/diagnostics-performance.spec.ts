import { diagnosticCpuSpans } from '../helpers/diagnostic-profile';
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
test('5000 tasks diagnostics overhead and bounded enhanced memory', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Fixed Chromium CDP measurements');
  test.setTimeout(300000);
  const rows = Array.from({ length: 5000 }, (_, index) => ({
    id: index + 1,
    hashString: (index + 1).toString(16).padStart(40, '0'),
    name: `Transfer ${index}`,
    status: 4,
    percentDone: 0.5,
    downloadDir: '/data',
    totalSize: 1024,
    haveValid: 512,
    trackers: [],
    trackerStats: [],
  }));
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? { version: '4.0.6', 'rpc-version': 17 }
            : body.method === 'torrent-get'
              ? { torrents: rows }
              : {},
      },
    });
  });
  await page.goto('/replay.html');
  await page.waitForFunction(() => !!window.__replay);
  await page.evaluate(async () => {
    await window.__replay.initialize();
    await window.__replay.renderWorkspace();
  });
  await expect(page.locator('.workspace')).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
  await page.evaluate(() => window.__replay.measure(false, 10));
  const baselineHeap = await heap();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  const rounds: any[] = [];
  for (let round = 0; round < 5; round++) {
    const order = round % 2 ? [true, false] : [false, true];
    for (const enabled of order)
      rounds.push({
        round,
        enabled,
        ...(await page.evaluate((enabled) => window.__replay.measure(enabled, 40), enabled)),
      });
  }
  const profile = await cdp.send('Profiler.stop');
  const cpu = await diagnosticCpuSpans(
    profile.profile,
    process.env.TWUI_PREVIEW_DIR || 'artifacts/replay-build',
  );
  const defaultHeap = await heap();
  await page.evaluate(async () => {
    await window.__replay.measure(true, 1);
    await window.__replay.start();
  });
  await page.evaluate(() => window.__replay.measure(true, 3));
  const enhancedHeap = await heap();
  const packet = await page.evaluate(() => window.__replay.stop());
  const p95 = (samples: number[]) =>
    samples.sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
  const metrics: any = {};
  for (const key of ['refresh', 'interaction']) {
    metrics[key] = {
      disabledP95: p95(rounds.filter((item) => !item.enabled).flatMap((item) => item[key])),
      enabledP95: p95(rounds.filter((item) => item.enabled).flatMap((item) => item[key])),
    };
    metrics[key].ratio = metrics[key].enabledP95 / metrics[key].disabledP95;
  }
  const report = {
    cpuSet: process.env.TWUI_TEST_CPUSET || 'unrestricted',
    rounds,
    metrics,
    cpu,
    baselineHeap,
    defaultExtra: defaultHeap - baselineHeap,
    enhancedExtra: enhancedHeap - defaultHeap,
    captureEligibility: packet.capture.eligibility,
    userAgent: await page.evaluate(() => navigator.userAgent),
  };
  await writeFile('artifacts/diagnostics-performance.json', JSON.stringify(report, null, 2));
  expect(cpu.diagnosticSamples).toBeGreaterThan(0);
  expect(cpu.maxConsecutiveDiagnosticCpuMs).toBeLessThanOrEqual(50);
  expect(report.defaultExtra).toBeLessThanOrEqual(10 * 1024 * 1024);
  expect(report.enhancedExtra).toBeLessThanOrEqual(30 * 1024 * 1024);
  expect(metrics.refresh.ratio).toBeLessThanOrEqual(1.05);
  expect(metrics.interaction.ratio).toBeLessThanOrEqual(1.05);
});
