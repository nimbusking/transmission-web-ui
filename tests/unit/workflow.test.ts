import { expect, it, vi } from 'vitest';
import { createMatchJob, MatchRunner } from '../../src/services/workflow';
import { runBatch } from '../../src/services/batch';
import { RpcError } from '../../src/services/rpc';
const target = (id: number) => ({
  target: { id, hashString: String(id), generation: 1 },
  name: String(id),
  directory: '/original',
});
it('B12: one failed/unknown item never blocks later batch results', async () => {
  let running = 0,
    maximum = 0;
  const result = await runBatch(
    [0, 1, 2, 3, 4],
    async (item) => {
      running++;
      maximum = Math.max(maximum, running);
      await Promise.resolve();
      running--;
      if (item === 0) throw new Error('invalid metainfo');
      if (item === 1) throw new RpcError('timeout', 'uncertain');
    },
    (id) => ({ id, name: String(id) }),
    { concurrency: 2 },
  );
  expect(maximum).toBe(2);
  expect(result.items.map((x) => x.status)).toEqual([
    'failed',
    'unknown',
    'success',
    'success',
    'success',
  ]);
});
it('C10: waits for actual verify completion; partial pauses one task and continues others', async () => {
  const job = createMatchJob([target(1), target(2)], ['/candidate']);
  const counts = new Map<number, number>();
  const read = vi.fn(async (t: { id: number }) => {
    const n = counts.get(t.id) ?? 0;
    counts.set(t.id, n + 1);
    return {
      id: t.id,
      status: n === 1 ? 2 : 0,
      metadataPercentComplete: 1,
      files: [{ name: 'a', length: 10, bytesCompleted: t.id === 1 ? 5 : 10 }],
    };
  });
  const locate = vi.fn(async () => {}),
    verify = vi.fn(async () => {});
  await new MatchRunner(
    { read, locate, verify },
    async () => {},
    async () => {},
  ).run(job);
  expect(job.items.map((x) => x.phase)).toEqual(['partial', 'matched']);
  expect(verify).toHaveBeenCalledTimes(2);
  expect(counts.get(1)).toBe(3);
});
it('cancellation stops future commands without claiming to undo verification', async () => {
  const job = createMatchJob([target(1), target(2)], ['/candidate']),
    verify = vi.fn(async () => {
      job.cancelled = true;
    });
  await new MatchRunner(
    {
      read: async (t) => ({ id: t.id, status: 0, metadataPercentComplete: 1 }),
      locate: async () => {},
      verify,
    },
    async () => {},
    async () => {},
  ).run(job);
  expect(verify).toHaveBeenCalledTimes(1);
  expect(job.items.map((x) => x.phase)).toEqual(['cancelled', 'cancelled']);
});
it('rejects whitespace-only candidate directories', () => {
  expect(() => createMatchJob([target(1)], ['  '])).toThrow();
});
it('C03: first already-located task does not skip later tasks', async () => {
  const job = createMatchJob([target(1), target(2)], ['/original']);
  const locate = vi.fn(async () => {});
  await new MatchRunner(
    {
      read: async (t) => ({
        id: t.id,
        status: 0,
        metadataPercentComplete: 1,
        files: [{ name: 'a', length: 1, bytesCompleted: 1 }],
      }),
      locate,
      verify: async () => {},
    },
    async () => {},
    async () => {},
  ).run(job);
  expect(locate).toHaveBeenCalledTimes(2);
  expect(job.items.map((x) => x.phase)).toEqual(['matched', 'matched']);
});
it('verification timeout needs review and never tries the next directory', async () => {
  const job = createMatchJob([target(1)], ['/a', '/b']);
  let reads = 0;
  const locate = vi.fn(async () => {});
  await new MatchRunner(
    {
      read: async (t) => ({ id: t.id, status: reads++ ? 2 : 0, metadataPercentComplete: 1 }),
      locate,
      verify: async () => {},
    },
    async () => {},
    async () => {},
    0,
  ).run(job);
  expect(job.items[0].phase).toBe('interrupted');
  expect(locate).toHaveBeenCalledTimes(1);
});
it('rejects directory changes made by another client while verification is pending', async () => {
  const job = createMatchJob([target(1)], ['/candidate']);
  let reads = 0;
  await new MatchRunner(
    {
      read: async (t) => ({
        id: t.id,
        status: 0,
        metadataPercentComplete: 1,
        downloadDir: reads++ ? '/external' : '/original',
        files: [{ name: 'a', length: 1, bytesCompleted: 1 }],
      }),
      locate: async () => {},
      verify: async () => {},
    },
    async () => {},
    async () => {},
  ).run(job);
  expect(job.items[0].phase).toBe('failed');
  expect(job.items[0].error).toContain('changed');
});
it('restoring waits for verification completion before claiming success', async () => {
  const job = createMatchJob([target(1)], ['/candidate']),
    item = job.items[0];
  item.currentDir = '/candidate';
  let reads = 0;
  const phases: string[] = [];
  await new MatchRunner(
    {
      read: async (t) => ({
        id: t.id,
        status: reads++ === 1 ? 2 : 0,
        metadataPercentComplete: 1,
        downloadDir: '/original',
        files: [{ name: 'a', length: 10, bytesCompleted: 5 }],
      }),
      locate: async () => {},
      verify: async () => {},
    },
    async (value) => {
      phases.push(value.items[0].phase);
    },
    async () => {},
  ).restore(job, item);
  expect(phases).toContain('waiting');
  expect(item.phase).toBe('restored');
  expect(item.currentDir).toBe('/original');
  expect(item.progress).toBe(0.5);
  expect(job.running).toBe(false);
});
it('cancelled restore records uncertainty and never claims restored', async () => {
  const job = createMatchJob([target(1)], ['/candidate']),
    item = job.items[0];
  await new MatchRunner(
    {
      read: async (t) => ({ id: t.id, status: 0, metadataPercentComplete: 1 }),
      locate: async () => {},
      verify: async () => {
        job.cancelled = true;
      },
    },
    async () => {},
    async () => {},
  ).restore(job, item);
  expect(item.phase).toBe('cancelled');
  expect(item.error).toContain('may still be running');
});
