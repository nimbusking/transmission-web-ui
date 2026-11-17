import { test, expect } from '@playwright/test';
import { fixture } from '../fixtures/torrent.mjs';
import { offlineReplay } from '../helpers/diagnostics';
import { writeFile, mkdir } from 'node:fs/promises';

for (const [port, version] of [
  [19191, '3.00'],
  [19192, '4.0.0'],
  [19193, '4.0.6'],
  [19195, '4.1.4'],
] as const) {
  test(`real daemon ${version} record, disconnect and replay`, async ({ page, browser }, info) => {
    test.skip(process.env.TWUI_DIAGNOSTICS_LIVE !== '1', 'Explicit isolated four-daemon lab only');
    let sessionId = '';
    async function rpc(method: string, args: Record<string, unknown> = {}) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(`http://127.0.0.1:${port}/transmission/rpc`, {
          method: 'POST',
          headers: { 'X-Transmission-Session-Id': sessionId },
          body: JSON.stringify({ method, arguments: args }),
        });
        if (response.status === 409) {
          sessionId = response.headers.get('X-Transmission-Session-Id')!;
          continue;
        }
        const body = await response.json();
        expect(body.result).toBe('success');
        return body.arguments;
      }
      throw new Error('Lab handshake failed');
    }
    const torrent = fixture(`diagnostics-${version}-${info.project.name}-${Date.now()}`);
    const added = await rpc('torrent-add', { metainfo: torrent.metainfo, paused: true });
    const id = added['torrent-added'].id;
    try {
      const session = await rpc('session-get');
      expect(session.version).toContain(version);
      await page.route('**/rpc', async (route) => {
        const response = await fetch(`http://127.0.0.1:${port}/transmission/rpc`, {
          method: 'POST',
          headers: route.request().headers(),
          body: route.request().postData()!,
        });
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: Buffer.from(await response.arrayBuffer()),
        });
      });
      await page.goto('/replay.html');
      await page.waitForFunction(() => !!window.__replay);
      await page.evaluate(async () => {
        await window.__replay.initialize();
        await window.__replay.start();
      });
      await page.evaluate(
        (id) => window.__replay.action({ action: 'execute', method: 'torrent-start', ids: [id] }),
        id,
      );
      await page.evaluate(
        (id) => window.__replay.action({ action: 'execute', method: 'torrent-stop', ids: [id] }),
        id,
      );
      const packet = await page.evaluate(() => window.__replay.stop());
      expect(packet.capture.eligibility, packet.capture.reasons.join(',')).toBe('replayable');
      await page.unroute('**/rpc');
      await page.route('**/rpc', (route) => route.abort());
      const report = await offlineReplay(browser, packet, info);
      expect(report.actual.results[0].status).toBe('success');
      await mkdir('artifacts/diagnostics-live', { recursive: true });
      await writeFile(
        `artifacts/diagnostics-live/${version}-${info.project.name}.json`,
        JSON.stringify({ packet, report }, null, 2),
      );
    } finally {
      await rpc('torrent-remove', { ids: [torrent.hash], 'delete-local-data': false });
    }
  });
}
