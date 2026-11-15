import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build, transformWithEsbuild } from 'vite';
import { bencode } from '../tests/fixtures/torrent.mjs';
await mkdir('.lab', { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    ssr: 'src/services/workflow.ts',
    outDir: '.lab/workflow',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'runner.mjs' } },
  },
});
const { createMatchJob, MatchRunner } = await import('../.lab/workflow/runner.mjs');
const { code } = await transformWithEsbuild(
  await readFile('src/services/rpc.ts', 'utf8'),
  'rpc.ts',
  { loader: 'ts', target: 'es2022' },
);
await writeFile('.lab/match-rpc.mjs', code);
const { RpcClient } = await import('../.lab/match-rpc.mjs'),
  results = [];
for (const [port, service] of [
  [19091, 'tr3'],
  [19092, 'tr4-base'],
  [19093, 'tr4'],
  [19095, 'tr4-current'],
]) {
  const client = new RpcClient(`http://127.0.0.1:${port}/transmission/rpc`),
    root = `/data/twui-match-${Date.now()}-${port}`,
    hashes = [];
  const python = (source) =>
    execFileSync('docker', [
      'compose',
      '-p',
      'twui-lab',
      '-f',
      'lab/compose.yaml',
      'exec',
      '-T',
      service,
      'python3',
      '-c',
      source,
    ]);
  const a = Buffer.alloc(16384, 65),
    b = Buffer.alloc(16384, 66);
  const targets = [];
  try {
    for (let i = 0; i < 2; i++) {
      const name = `match-${i}`,
        info = {
          name,
          files: [
            { length: a.length, path: ['a.bin'] },
            { length: b.length, path: ['b.bin'] },
          ],
          'piece length': 16384,
          pieces: Buffer.concat([
            createHash('sha1').update(a).digest(),
            createHash('sha1').update(b).digest(),
          ]),
          private: 1,
        };
      const metainfo = bencode({ announce: 'http://127.0.0.1:19999/announce', info }).toString(
        'base64',
      );
      const added = (
        await client.call('torrent-add', {
          metainfo,
          paused: true,
          'download-dir': `${root}/original`,
        })
      )['torrent-added'];
      hashes.push(added.hashString);
      python(
        `from pathlib import Path\nroot=Path(${JSON.stringify(root)})\nfor candidate in ['original','partial','full']:\n p=root/candidate/${JSON.stringify(name)}; p.mkdir(parents=True,exist_ok=True); (p/'a.bin').write_bytes(b'A'*16384)\n if candidate!='partial' or ${i}==1: (p/'b.bin').write_bytes(b'B'*16384)`,
      );
      targets.push({
        target: { id: added.id, hashString: added.hashString, generation: 1 },
        name,
        directory: `${root}/original`,
      });
    }
    const read = async (target) =>
      (
        await client.torrents(
          [
            'id',
            'status',
            'metadataPercentComplete',
            'downloadDir',
            'files',
            'recheckProgress',
            'error',
            'errorString',
          ],
          [target.hashString],
        )
      ).torrents[0];
    for (const { target } of targets) {
      for (let i = 0; i < 100; i++) {
        if ((await read(target)).status === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const log = [],
      adapter = {
        read,
        locate: async (target, location) => {
          await client.call('torrent-set-location', {
            ids: [target.hashString],
            location,
            move: false,
          });
        },
        verify: async (target) => {
          await client.call('torrent-verify', { ids: [target.hashString] });
        },
      };
    const job = createMatchJob(targets, [`${root}/partial`, `${root}/full`]),
      runner = new MatchRunner(
        adapter,
        async (value) => {
          log.push(JSON.parse(JSON.stringify(value)));
        },
        (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 200))),
        30000,
      );
    await runner.run(job);
    assert.deepEqual(
      job.items.map((item) => item.phase),
      ['partial', 'matched'],
    );
    job.items[0].candidateIndex++;
    job.items[0].phase = 'planned';
    await runner.run(job);
    assert.deepEqual(
      job.items.map((item) => item.phase),
      ['matched', 'matched'],
    );
    assert.equal((await read(targets[0].target)).downloadDir, `${root}/full`);
    await runner.restore(job, job.items[0]);
    assert.equal(job.items[0].phase, 'restored');
    assert.equal((await read(targets[0].target)).downloadDir, `${root}/original`);
    assert.equal(
      (await read(targets[0].target)).files.reduce((sum, file) => sum + file.bytesCompleted, 0),
      32768,
    );
    const cancelled = createMatchJob(targets, [`${root}/full`]);
    let submitted = 0;
    const cancelling = new MatchRunner(
      {
        ...adapter,
        verify: async (target) => {
          submitted++;
          await adapter.verify(target);
          cancelling.cancel(cancelled);
        },
      },
      async () => {},
      (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 200))),
      30000,
    );
    await cancelling.run(cancelled);
    assert.equal(submitted, 1);
    assert.deepEqual(
      cancelled.items.map((item) => item.phase),
      ['cancelled', 'cancelled'],
    );
    assert.match(cancelled.items[0].error, /may still be running/);
    results.push({
      version: (await client.session()).version,
      partialWait: true,
      otherItemContinued: true,
      nextCandidateMatched: true,
      restoreVerified: true,
      cancelStopsFutureCommands: true,
      result: 'passed',
      savedTransitions: log.length,
    });
  } finally {
    for (const hash of hashes)
      await client.call('torrent-remove', { ids: [hash], 'delete-local-data': false });
    python(`import shutil; shutil.rmtree(${JSON.stringify(root)}, ignore_errors=True)`);
  }
}
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/match-results.json',
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
console.log(results);
