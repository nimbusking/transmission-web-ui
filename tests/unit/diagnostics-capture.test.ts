import { describe, it, expect, vi } from 'vitest';
import { CaptureRecorder, parseCapture, seal } from '../../src/services/diagnostics/capture';
import { Redactor } from '../../src/services/diagnostics/redact';
const checkpoint = () => ({
  wallTime: Date.now(),
  session: { version: '4.0.6', 'rpc-version': 17 },
  torrents: [
    {
      id: 91,
      hashString: 'PRIVATE-HASH',
      name: 'PRIVATE-NAME',
      downloadDir: '/PRIVATE/path',
      status: 4,
    },
  ],
  ui: { autoRefresh: false, refreshIntervalMs: 5000 },
  generation: 1,
  lastSessionAge: 100,
  lastSnapshotAge: 100,
  identities: [] as [number, number][],
  selectedId: null,
  stale: false,
});
const observed = () => ({
  torrents: checkpoint().torrents,
  selectedId: null,
  stale: false,
  ready: true,
  generation: 1,
  authenticationRequired: false,
  results: [],
  detailId: null,
});
describe('enhanced capture protocol', () => {
  it('produces a sealed, structurally checked package without original identities', async () => {
    const capture = new CaptureRecorder();
    capture.start(checkpoint());
    const packet = await capture.stop(observed());
    expect(JSON.stringify(packet)).not.toContain('PRIVATE');
    await expect(parseCapture(JSON.stringify(packet), 'development')).resolves.toMatchObject({
      capture: { eligibility: 'replayable' },
    });
    packet.observed.stale = true;
    await expect(parseCapture(JSON.stringify(packet), 'development')).rejects.toThrow(
      'integrity-mismatch',
    );
  });
  it('rejects missing event references even when integrity is recalculated', async () => {
    const capture = new CaptureRecorder();
    capture.start(checkpoint());
    const packet = await capture.stop(observed());
    packet.events.splice(0, 0, {
      seq: 1,
      at: new Date().toISOString(),
      monoMs: 0,
      type: 'rpc.end',
      level: 'info',
      data: { requestId: 'req-1' },
    });
    packet.events[1].seq = 2;
    await expect(parseCapture(JSON.stringify(await seal(packet)), 'development')).rejects.toThrow(
      'invalid-request-reference',
    );
  });
  it('rejects unfinished work and unsupported methods', async () => {
    const capture = new CaptureRecorder();
    capture.start(checkpoint());
    capture.rpc('rpc.start', {
      method: 'torrent-get',
      arguments: {},
      requestId: 'req-1',
      tag: 1,
      timeoutMs: 20000,
    });
    expect((await capture.stop(observed())).capture.reasons).toContain('pending-work');
    capture.start(checkpoint());
    capture.rpc('rpc.start', { method: 'torrent-remove' });
    expect((await capture.stop(observed())).capture.reasons).toContain('unsupported-method');
  });
  it('keeps null/zero/missing and stable synthetic identifiers while removing tracker secrets', () => {
    const redact = new Redactor();
    const result = redact.torrent({
      id: 90,
      hashString: 'SECRET',
      percentDone: 0,
      rateUpload: null,
      trackers: [{ id: 1, announce: 'https://secret/?passkey=SECRET', tier: 0 }],
    });
    expect(result).toMatchObject({ id: 1, percentDone: 0, rateUpload: null });
    expect(result).not.toHaveProperty('rateDownload');
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(redact.args('torrent-stop', { ids: ['SECRET'] }).ids).toEqual([result.hashString]);
  });
  it('marks oversize data ineligible rather than silently dropping replay input', async () => {
    const capture = new CaptureRecorder();
    capture.start(checkpoint());
    capture.event('test', { input: 'x'.repeat(512 * 1024) });
    expect((await capture.stop(observed())).capture.reasons).toContain('event-oversize');
  });
});

it('stops on event and duration budgets rather than overwriting the checkpoint', async () => {
  const capture = new (await import('../../src/services/diagnostics/capture')).CaptureRecorder();
  capture.start(checkpoint());
  for (let index = 0; index < 10001; index++) capture.event('test', { count: index });
  const packet = await capture.stop(observed());
  expect(packet.capture.reasons).toContain('capacity-limit');
  expect(packet.checkpoint.torrents).toHaveLength(1);
});

it('stops at five minutes and refuses unsupported checkpoint shapes before claiming replayability', async () => {
  vi.useFakeTimers();
  try {
    const capture = new CaptureRecorder();
    capture.start(checkpoint());
    await vi.advanceTimersByTimeAsync(300000);
    expect((await capture.stop(observed())).capture.reasons).toContain('duration-limit');
  } finally {
    vi.useRealTimers();
  }
  const capture = new CaptureRecorder();
  capture.start({
    ...checkpoint(),
    session: { version: 'unsupported-version', 'rpc-version': 17 },
  });
  expect((await capture.stop(observed())).capture).toMatchObject({
    eligibility: 'ineligible',
    reasons: ['schema-coverage-gap'],
  });
});
