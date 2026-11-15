import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import { fixture } from '../tests/fixtures/torrent.mjs';
const args = process.argv.slice(2),
  clear = args.includes('--clear');
const value = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const port = Number(value('--port', '19093')),
  count = Number(value('--count', '100'));
assert.ok([19091, 19092, 19093].includes(port), 'Only isolated lab ports are allowed');
assert.ok(Number.isInteger(count) && count > 0 && count <= 5000, 'Count must be 1..5000');
await mkdir('.lab', { recursive: true });
const { code } = await transformWithEsbuild(
  await readFile('src/services/rpc.ts', 'utf8'),
  'rpc.ts',
  { loader: 'ts', target: 'es2022' },
);
await writeFile('.lab/rpc.mjs', code);
const { RpcClient } = await import('../.lab/rpc.mjs');
const rpc = new RpcClient(`http://127.0.0.1:${port}/transmission/rpc`),
  session = await rpc.session();
const file = `.lab/seed-${port}.json`;
let manifest;
try {
  manifest = JSON.parse(await readFile(file, 'utf8'));
} catch {
  manifest = { prefix: `twui-scale-${Date.now()}-`, hashes: [] };
}
if (clear) {
  const rows = (await rpc.torrents(['id', 'hashString', 'name'])).torrents;
  const hashes = rows
    .filter(
      (row) => row.name.startsWith(manifest.prefix) && manifest.hashes.includes(row.hashString),
    )
    .map((row) => row.hashString);
  for (let i = 0; i < hashes.length; i += 100) {
    await rpc.call('torrent-remove', { ids: hashes.slice(i, i + 100), 'delete-local-data': false });
    if (i % 500 === 0) console.log(`Cleanup ${Math.min(i + 100, hashes.length)}/${hashes.length}`);
  }
  await writeFile(file, JSON.stringify({ ...manifest, hashes: [] }));
  console.log(`Removed ${hashes.length} tasks from this fixture manifest only`);
} else {
  const start = performance.now();
  for (let i = manifest.hashes.length; i < count; i++) {
    const data = fixture(`${manifest.prefix}${String(i).padStart(4, '0')}`);
    const response = await rpc.call('torrent-add', {
      metainfo: data.metainfo,
      paused: true,
      'download-dir': '/data/scale',
    });
    manifest.hashes.push((response['torrent-added'] ?? response['torrent-duplicate']).hashString);
    // Keep an incremental recovery manifest so interrupted seeding can be cleaned safely.
    if (i % 100 === 0) {
      await writeFile(file, JSON.stringify(manifest));
      console.log(`${i + 1}/${count}`);
    }
  }
  await writeFile(file, JSON.stringify(manifest));
  if (args.includes('--settle-paused')) {
    const service = port === 19091 ? 'tr3' : port === 19092 ? 'tr4-base' : 'tr4';
    const compose = ['compose', '-p', 'twui-lab', '-f', 'lab/compose.yaml'];
    execFileSync('docker', [...compose, 'stop', '-t', '120', service], { stdio: 'inherit' });
    execFileSync('docker', [...compose, 'up', '-d', '--no-build', service], { stdio: 'inherit' });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const state = (await rpc.torrents(['id', 'hashString', 'status'])).torrents.filter((row) =>
          manifest.hashes.includes(row.hashString),
        );
        if (state.length === count && state.every((row) => row.status === 0)) break;
      } catch {
        /* controlled restart only */
      }
      if (attempt === 99) throw new Error('Paused baseline did not settle');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const snapshot = performance.now(),
    rows = (
      await rpc.torrents([
        'id',
        'name',
        'hashString',
        'status',
        'downloadDir',
        'percentDone',
        'rateDownload',
        'rateUpload',
      ])
    ).torrents;
  assert.equal(rows.filter((row) => manifest.hashes.includes(row.hashString)).length, count);
  const result = {
    at: new Date().toISOString(),
    version: session.version,
    count,
    seedMs: snapshot - start,
    snapshotMs: performance.now() - snapshot,
  };
  await mkdir('artifacts', { recursive: true });
  await writeFile(`artifacts/scale-${port}.json`, JSON.stringify(result, null, 2));
  console.log(result);
}
