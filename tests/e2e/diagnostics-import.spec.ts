import { test, expect } from '@playwright/test';
test('strict import refuses corrupt, unsupported and incomplete packages', async ({ page }) => {
  await page.route('**/rpc', (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        result: 'success',
        arguments:
          body.method === 'session-get'
            ? { version: '4.0.6', 'rpc-version': 17 }
            : body.method === 'torrent-get'
              ? { torrents: [] }
              : {},
        tag: body.tag,
      },
    });
  });
  await page.goto('/replay.html');
  await page.waitForFunction(() => !!window.__replay);
  const results = await page.evaluate(async () => {
    await window.__replay.initialize();
    await window.__replay.start();
    const valid = await window.__replay.stop();
    const outcomes = [];
    for (const type of ['schema', 'build', 'integrity', 'checkpoint', 'reference', 'truncated']) {
      let packet = structuredClone(valid);
      if (type === 'schema') packet.schemaVersion = 99;
      if (type === 'build') packet.app.buildId = 'unknown-build';
      if (type === 'integrity') packet.observed.stale = true;
      if (type === 'checkpoint') delete packet.checkpoint.ui;
      if (type === 'reference') {
        packet.events.unshift({
          seq: 1,
          at: new Date().toISOString(),
          monoMs: 0,
          type: 'rpc.end',
          level: 'info',
          data: { requestId: 'req-missing' },
        });
        packet.events[1].seq = 2;
      }
      if (type === 'truncated') packet.events.pop();
      if (['checkpoint', 'reference', 'truncated'].includes(type))
        packet = await window.__replay.seal(packet);
      try {
        await window.__replay.prepare(JSON.stringify(packet));
        outcomes.push({ type, refused: false });
      } catch {
        outcomes.push({ type, refused: true });
      }
    }
    return outcomes;
  });
  expect(results.every((item: any) => item.refused)).toBe(true);
});

test('large list response marks capture incomplete and preserves live business state', async ({
  page,
}) => {
  const rows = Array.from({ length: 5000 }, (_, index) => ({
    id: index + 1,
    hashString: (index + 1).toString(16).padStart(40, '0'),
    name: `PRIVATE-${index}`,
    downloadDir: '/PRIVATE/path',
    status: 4,
    trackers: [],
    trackerStats: [],
  }));
  await page.route('**/rpc', (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
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
  const output = await page.evaluate(async () => {
    await window.__replay.initialize();
    await window.__replay.start();
    await window.__replay.action({ action: 'refresh', full: true });
    return { packet: await window.__replay.stop(), count: window.__replay.state().torrents.length };
  });
  expect(output.count).toBe(5000);
  expect(output.packet.capture.eligibility).toBe('ineligible');
  expect(output.packet.capture.reasons).toContain('event-oversize');
  expect(JSON.stringify(output.packet)).not.toContain('PRIVATE');
});
