import { test, expect } from '@playwright/test';
import { offlineReplay } from '../helpers/diagnostics';

for (const scenario of ['cancel', 'generation', 'mixed']) {
  test(`replay preserves concurrency and identities: ${scenario}`, async ({
    page,
    browser,
  }, info) => {
    let armed = false;
    let delayed = false;
    let reconnect = false;
    const statuses = [4, 4];
    await page.route('**/rpc', async (route) => {
      const body = route.request().postDataJSON();
      if (armed && body.method === 'torrent-stop') {
        if (body.arguments.ids.includes('b'.repeat(40))) {
          await route.fulfill({ status: 403 });
          return;
        }
        statuses[0] = 0;
      }
      if (armed && scenario === 'generation' && body.method === 'session-get') reconnect = true;
      if (
        armed &&
        body.method === 'torrent-get' &&
        !delayed &&
        (scenario === 'cancel' || scenario === 'generation')
      ) {
        delayed = true;
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      const rows = [91, 92]
        .filter((id) => !reconnect || id === 92)
        .map((id, index) => ({
          id,
          hashString: (id === 91 ? 'a' : 'b').repeat(40),
          name: `PRIVATE-${id}`,
          status: statuses[index],
          downloadDir: '/PRIVATE',
          errorString: '',
          trackers: [],
          trackerStats: [],
          error: 0,
          percentDone: 0.5,
        }));
      const selected = Array.isArray(body.arguments.ids)
        ? rows.filter((row) => body.arguments.ids.includes(row.hashString))
        : rows;
      const args =
        body.method === 'session-get'
          ? { version: '4.0.6', 'rpc-version': 17, 'session-id': 'PRIVATE-session' }
          : body.method === 'torrent-get'
            ? {
                torrents: selected.map((row) =>
                  Object.fromEntries(
                    body.arguments.fields
                      .filter((key: string) => key in row)
                      .map((key: string) => [key, (row as any)[key]]),
                  ),
                ),
              }
            : {};
      try {
        await route.fulfill({ json: { result: 'success', arguments: args, tag: body.tag } });
      } catch {
        /* Original fetch can be cancelled while fixture waits. */
      }
    });
    await page.goto('/replay.html');
    await page.waitForFunction(() => !!window.__replay);
    await page.evaluate(async () => {
      await window.__replay.initialize();
      await window.__replay.start();
    });
    armed = true;
    if (scenario === 'cancel') {
      const request = page.waitForRequest((request) =>
        request.postDataJSON()?.arguments?.ids?.includes('a'.repeat(40)),
      );
      await page.evaluate(() => window.__replay.action({ action: 'select', id: 91 }));
      await request;
      await page.evaluate(() => window.__replay.action({ action: 'select', id: 92 }));
      await page.waitForFunction(() => window.__replay.state().detailId === 92);
    } else if (scenario === 'generation') {
      const request = page.waitForRequest(
        (request) => request.postDataJSON()?.method === 'torrent-get',
      );
      await page.evaluate(() => {
        void window.__replay.action({ action: 'refresh', full: false }).catch(() => {});
      });
      await request;
      await page.evaluate(() => window.__replay.action({ action: 'connect' }));
    } else
      await page.evaluate(() =>
        window.__replay.action({ action: 'execute', method: 'torrent-stop', ids: [91, 92] }),
      );
    const packet = await page.evaluate(() => window.__replay.stop());
    expect(packet.capture.eligibility, JSON.stringify(packet.capture)).toBe('replayable');
    const report = await offlineReplay(browser, packet, info);
    if (scenario === 'cancel') expect(report.actual.detailId).toBe(2);
    if (scenario === 'generation') {
      expect(report.actual.torrents).toHaveLength(1);
      expect(report.actual.generation).toBe(2);
    }
    if (scenario === 'mixed')
      expect(report.actual.results.map((item: any) => item.status)).toEqual(['success', 'failed']);
  });
}
