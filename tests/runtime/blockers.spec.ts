import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { RpcClient } from '../../src/services/rpc';

interface Case {
  version: string;
  port: number;
  hash: string;
  metainfo: string;
}
const cases: Case[] = JSON.parse(await readFile('.lab/blockers-runtime/cases.json', 'utf8'));
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
for (const c of cases)
  test(`${c.version}: saved baseline and actual runtime behavior`, async ({ page }) => {
    const rpc = new RpcClient(`http://127.0.0.1:${c.port}/transmission/rpc`),
      source = new RpcClient('http://127.0.0.1:19896/transmission/rpc'),
      writes: Record<string, unknown>[] = [],
      results: Record<string, unknown> = {};
    page.on('request', (request) => {
      if (request.url().endsWith('/transmission/rpc')) {
        const body = request.postDataJSON();
        if (body?.method === 'session-set') writes.push(body.arguments);
      }
    });
    async function record(name: string, value: unknown) {
      results[name] = value;
      await writeFile(
        `artifacts/blockers-runtime-${c.version}.json`,
        JSON.stringify({ version: c.version, writes, results }, null, 2) + '\n',
      );
      console.log(`[${c.version}] ${name}: ${JSON.stringify(value)}`);
    }
    const button = page.getByRole('button', { name: 'Save Transmission parameters', exact: true });
    const choose = async (name: string) =>
      page.locator('.settings-dialog .n-tabs-tab').getByText(name, { exact: true }).click();
    async function save(name: string, patch: Record<string, unknown>) {
      await choose(name);
      for (const [key, value] of Object.entries(patch)) {
        const field = page.locator(`[data-setting="${key}"]`);
        if (typeof value === 'boolean') await field.getByRole('checkbox').setChecked(value);
        else {
          const input = field.locator('input').first();
          await input.fill(String(value));
          await input.press(key.startsWith('alt-speed-time-') ? 'Enter' : 'Tab');
        }
      }
      if (await button.isEnabled()) await button.click();
      await expect(button).toBeDisabled();
      await expect(page.locator('.settings-footer')).not.toContainText(
        'Unsaved Transmission changes',
      );
    }
    const row = async () =>
      (await rpc.torrents(['status', 'downloadedEver', 'rateDownload', 'peers'], [c.hash]))
        .torrents[0];
    async function sample(seconds = 6) {
      const a = await row(),
        start = Date.now();
      await delay(seconds * 1000);
      const b = await row(),
        elapsed = (Date.now() - start) / 1000;
      return {
        bytes: b.downloadedEver! - a.downloadedEver!,
        seconds: elapsed,
        bytesPerSecond: (b.downloadedEver! - a.downloadedEver!) / elapsed,
      };
    }
    await page.goto(`http://127.0.0.1:${c.port}/transmission/web/?lang=en`);
    await expect(page.locator('.connection')).toContainText('Connected');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await save('Basic settings', { 'cache-size-mb': 5 });
    await save('Basic settings', { 'cache-size-mb': 6 });
    expect(writes).toEqual([{ 'cache-size-mb': 5 }, { 'cache-size-mb': 6 }]);
    await record('savedBaseline', {
      cacheMB: (await rpc.session())['cache-size-mb'],
      noUnsavedChanges: true,
    });
    if (['3.00', '4.1.4'].includes(c.version)) {
      await save('Bandwidth limits', {
        'speed-limit-down-enabled': true,
        'speed-limit-down': 128,
        'queue-stalled-enabled': false,
      });
      await save('Network', {
        'utp-enabled': false,
        'download-queue-enabled': true,
        'download-queue-size': 1,
      });
      const fixtures = JSON.parse(await readFile('.lab/blockers-runtime/queue.json', 'utf8'))[
        c.version
      ];
      const hashes = fixtures.map((f: any) => f.hash);
      for (const f of fixtures) {
        await source.call('torrent-add', {
          metainfo: f.metainfo,
          paused: true,
          'download-dir': '/seeddata',
        });
        await expect
          .poll(
            async () => (await source.torrents(['percentDone'], [f.hash])).torrents[0]?.percentDone,
            { timeout: 30000 },
          )
          .toBe(1);
        await source.call('torrent-start', { ids: [f.hash] });
        await rpc.call('torrent-add', {
          metainfo: f.metainfo,
          paused: true,
          'download-dir': '/data',
        });
      }
      const queue = async () =>
        (await rpc.torrents(['hashString', 'status', 'downloadedEver', 'rateDownload'], hashes))
          .torrents;
      await rpc.call('torrent-start', { ids: hashes });
      await expect
        .poll(async () => (await queue()).filter((t) => t.status === 4).length, { timeout: 45000 })
        .toBe(1);
      await expect.poll(async () => (await queue()).filter((t) => t.status === 3).length).toBe(2);
      await save('Network', { 'download-queue-size': 2 });
      await expect
        .poll(async () => (await queue()).filter((t) => t.status === 4).length, { timeout: 45000 })
        .toBe(2);
      await save('Network', { 'download-queue-enabled': false });
      await record('queueAfterDisable', await queue());
      // Explicit ordinary start, as in the historical failed scenario; never force-start.
      await rpc.call('torrent-start', { ids: hashes });
      await expect
        .poll(async () => (await queue()).filter((t) => t.status === 4).length, { timeout: 60000 })
        .toBe(3);
      await expect
        .poll(async () => (await queue()).filter((t) => t.rateDownload! > 0).length, {
          timeout: 90000,
        })
        .toBe(3);
      const before = await queue();
      await delay(10000);
      const after = await queue();
      await record('queueAfterExplicitStart', { before, after });
      for (const row of after)
        expect(
          row.downloadedEver! -
            before.find((t) => t.hashString === row.hashString)!.downloadedEver!,
        ).toBeGreaterThan(0);
      await rpc.call('torrent-stop', { ids: hashes });
      if (c.version === '3.00') return;
    }
    await save('Bandwidth limits', {
      'speed-limit-down-enabled': true,
      'speed-limit-down': 128,
    });
    await source.call('torrent-add', {
      metainfo: c.metainfo,
      paused: true,
      'download-dir': '/seeddata',
    });
    await expect
      .poll(
        async () => (await source.torrents(['percentDone'], [c.hash])).torrents[0]?.percentDone,
        { timeout: 30000 },
      )
      .toBe(1);
    await source.call('torrent-start', { ids: [c.hash] });
    await rpc.call('torrent-add', { metainfo: c.metainfo, paused: false, 'download-dir': '/data' });
    await expect
      .poll(async () => (await row())?.peers?.some((p: any) => p.isDownloadingFrom && !p.isUTP), {
        timeout: 60000,
      })
      .toBe(true);
    await expect
      .poll(async () => (await row()).rateDownload, { timeout: 45000 })
      .toBeGreaterThan(90000);
    const normal = await sample();
    const now = new Date(),
      begin = new Date(
        Math.floor(Date.now() / 60000) * 60000 + (now.getUTCSeconds() < 45 ? 1 : 2) * 60000,
      ),
      end = new Date(begin.getTime() + 60000);
    const time = (d: Date) =>
      `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    await save('Schedule', {
      'alt-speed-down': 32,
      'alt-speed-time-enabled': true,
      'alt-speed-time-begin': time(begin),
      'alt-speed-time-end': time(end),
    });
    await choose('Network');
    await page.locator('[data-setting="peer-port"] input').fill('51414');
    await page.locator('[data-setting="peer-port"] input').press('Tab');
    await choose('Schedule');
    const checkbox = page.locator('[data-setting="alt-speed-enabled"]').getByRole('checkbox');
    console.log(`[${c.version}] waiting for actual UTC ${time(begin)}–${time(end)}`);
    await expect
      .poll(async () => (await rpc.session())['alt-speed-enabled'], { timeout: 110000 })
      .toBe(true);
    await expect(checkbox).toBeChecked({ timeout: 40000 });
    await expect(page.getByTestId('schedule-live-state')).toContainText('alternative speed limits');
    await delay(2000);
    const alternate = await sample();
    await expect
      .poll(async () => (await rpc.session())['alt-speed-enabled'], { timeout: 90000 })
      .toBe(false);
    await expect(checkbox).not.toBeChecked({ timeout: 40000 });
    await expect(page.getByTestId('schedule-live-state')).toContainText('normal speed limits');
    await delay(2000);
    const restored = await sample();
    await choose('Network');
    await expect(page.locator('[data-setting="peer-port"] input')).toHaveValue('51414');
    expect((await rpc.session())['peer-port']).toBe(51413);
    await record('actualScheduleAndDraft', {
      daemonTimezone: 'UTC',
      begin: time(begin),
      end: time(end),
      normal,
      alternate,
      restored,
      checkboxFollowedBothTransitions: true,
      otherDraftPreserved: true,
      draftPortNotApplied: true,
    });
    expect(alternate.bytesPerSecond).toBeGreaterThan(8000);
    expect(alternate.bytesPerSecond).toBeLessThan(70000);
    expect(normal.bytesPerSecond).toBeGreaterThan(alternate.bytesPerSecond * 2);
    expect(restored.bytesPerSecond).toBeGreaterThan(alternate.bytesPerSecond * 2);
  });
