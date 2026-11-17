import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DiagnosticRecorder, safeMetadata } from '../../src/services/diagnostics/recorder';
afterEach(() => vi.useRealTimers());
describe('local diagnostics', () => {
  it('does not retain secrets or arbitrary messages', () => {
    expect(
      safeMetadata({
        password: 'secret',
        message: '/private/file',
        method: 'torrent-get',
        kind: 'https://tracker/?passkey=secret',
        count: 0,
      }),
    ).toEqual({ method: 'torrent-get', count: 0 });
  });
  it('bounds memory, exports an independent diagnostic-only snapshot, and respects disabling', () => {
    const recorder = new DiagnosticRecorder();
    for (let i = 0; i < 1100; i++) recorder.record('rpc.end', { count: i });
    expect(recorder.events).toHaveLength(1000);
    expect(recorder.droppedEvents).toBe(100);
    const snapshot = recorder.export();
    snapshot.events.length = 0;
    expect(recorder.events).toHaveLength(1000);
    expect(snapshot.capture.eligibility).toBe('diagnostic-only');
    recorder.enabled = false;
    recorder.record('runtime.error');
    expect(recorder.events).toHaveLength(1000);
  });
  it('retains previous sessions and clears only its own instance', async () => {
    const first = new DiagnosticRecorder();
    await first.initialize('https://example.test/a/rpc');
    first.record('rpc.error', { kind: 'timeout' });
    await first.flush();
    const other = new DiagnosticRecorder();
    await other.initialize('https://example.test/b/rpc');
    other.record('rpc.error', { kind: 'network' });
    await other.flush();
    const next = new DiagnosticRecorder();
    await next.initialize('https://example.test/a/rpc');
    expect(await next.previous()).toHaveLength(1);
    await next.clear();
    expect(await next.previous()).toHaveLength(0);
    const nextOther = new DiagnosticRecorder();
    await nextOther.initialize('https://example.test/b/rpc');
    expect(await nextOther.previous()).toHaveLength(1);
  });
});

describe('retention and failure boundaries', () => {
  it('keeps fixed fault snippets after the ordinary ring rolls over', async () => {
    const recorder = new DiagnosticRecorder();
    await recorder.initialize('https://retention.test/rpc');
    recorder.record('rpc.error', { kind: 'protocol' });
    for (let index = 0; index < 20; index++) recorder.record('rpc.end', { count: index });
    for (let index = 0; index < 1100; index++) recorder.record('rpc.end');
    const faults = await recorder.faults();
    expect(faults.some((packet) => packet.events.some((event) => event.type === 'rpc.error'))).toBe(
      true,
    );
    expect(recorder.events.some((event) => event.type === 'rpc.error')).toBe(false);
  });
  it('persists the collection preference and does not clear another instance', async () => {
    const first = new DiagnosticRecorder();
    await first.initialize('https://pref.test/rpc');
    await first.setEnabled(false);
    const next = new DiagnosticRecorder();
    await next.initialize('https://pref.test/rpc');
    expect(next.enabled).toBe(false);
    await next.setEnabled(true);
  });
  it('expires ordinary records after 24 hours and fault captures after seven days', async () => {
    const { openDB } = await import('idb');
    const recorder = new DiagnosticRecorder();
    await recorder.initialize('https://ttl.test/rpc');
    const db = await openDB('transmission-web-ui-diagnostics', 1);
    await db.put(
      'sessions',
      { instanceId: 'ttl', updatedAt: Date.now() - 86400001, package: recorder.export() },
      'expired-session',
    );
    await db.put(
      'captures',
      {
        instanceId: 'ttl',
        updatedAt: Date.now() - 604800001,
        package: { ...recorder.export(), capture: { mode: 'fault' } },
      },
      'expired-fault',
    );
    await recorder.cleanup(true);
    expect(await db.get('sessions', 'expired-session')).toBeUndefined();
    expect(await db.get('captures', 'expired-fault')).toBeUndefined();
    db.close();
  });
  it('removes oldest captures when instance or global byte budgets are exceeded', async () => {
    const { openDB } = await import('idb');
    const recorder = new DiagnosticRecorder();
    await recorder.initialize('https://budget.test/rpc');
    const db = await openDB('transmission-web-ui-diagnostics', 1);
    for (let index = 0; index < 3; index++)
      await db.put(
        'captures',
        {
          instanceId: 'budget-fixture',
          updatedAt: Date.now() + index,
          package: { capture: { mode: 'enhanced' }, padding: 'x'.repeat(7 * 1024 * 1024) },
        },
        `budget-${index}`,
      );
    await recorder.cleanup(true);
    expect(await db.get('captures', 'budget-0')).toBeUndefined();
    expect(await db.get('captures', 'budget-2')).toBeDefined();
    for (let index = 0; index < 3; index++) await db.delete('captures', `budget-${index}`);
    db.close();
  });
});

it('enforces the global 40MiB budget across instances independently of the 20MiB instance limit', async () => {
  const { openDB } = await import('idb');
  const recorder = new DiagnosticRecorder();
  await recorder.initialize('https://global-budget.test/rpc');
  const db = await openDB('transmission-web-ui-diagnostics', 1);
  for (let index = 0; index < 6; index++)
    await db.put(
      'captures',
      {
        instanceId: `global-budget-${Math.floor(index / 2)}`,
        updatedAt: Date.now() + index,
        package: { capture: { mode: 'enhanced' }, padding: 'x'.repeat(8 * 1024 * 1024) },
      },
      `global-budget-${index}`,
    );
  await recorder.cleanup(true);
  expect(await db.get('captures', 'global-budget-0')).toBeUndefined();
  expect(await db.get('captures', 'global-budget-5')).toBeDefined();
  for (let index = 0; index < 6; index++) await db.delete('captures', `global-budget-${index}`);
  db.close();
});
it('retains only the newest three fixed fault snippets', async () => {
  const recorder = new DiagnosticRecorder();
  await recorder.initialize('https://fault-count.test/rpc');
  for (let index = 0; index < 4; index++) {
    recorder.record('rpc.error', { kind: 'protocol', requestId: `fault-${index}` });
    await recorder.finishFault();
  }
  expect(await recorder.faults()).toHaveLength(3);
});
