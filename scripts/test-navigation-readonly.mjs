import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
const { code } = await transformWithEsbuild(
  await readFile('src/services/rpc.ts', 'utf8'),
  'rpc.ts',
  { loader: 'ts', target: 'es2022' },
);
await mkdir('.lab', { recursive: true });
await writeFile('.lab/navigation-rpc.mjs', code);
const { RpcClient } = await import('../.lab/navigation-rpc.mjs');
const results = [];
for (const [port, version] of [
  [19091, '3.00'],
  [19092, '4.0.0'],
  [19093, '4.0.6'],
  [19095, '4.1.4'],
]) {
  const client = new RpcClient(`http://127.0.0.1:${port}/transmission/rpc`);
  const session = await client.session();
  assert.ok(session.version.startsWith(version));
  const stats = await client.call('session-stats');
  for (const scope of ['cumulative-stats', 'current-stats'])
    for (const key of [
      'uploadedBytes',
      'downloadedBytes',
      'filesAdded',
      'sessionCount',
      'secondsActive',
    ])
      assert.ok(Number.isFinite(stats[scope]?.[key]), `${version} ${scope}.${key}`);
  const { torrents } = await client.torrents([
    'id',
    'downloadDir',
    'trackers',
    'trackerStats',
    'totalSize',
    'error',
  ]);
  results.push({
    version: session.version,
    rpc: session['rpc-version'],
    stats,
    torrentCount: torrents.length,
    fields: ['downloadDir', 'trackers', 'trackerStats', 'totalSize', 'error'],
    readOnly: true,
  });
}
await writeFile('artifacts/navigation-rpc-results.json', JSON.stringify(results, null, 2) + '\n');
console.log(
  results
    .map((x) => `${x.version}: statistics and torrent fields accepted (${x.torrentCount} tasks)`)
    .join('\n'),
);
