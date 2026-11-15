import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import { fixture } from '../tests/fixtures/torrent.mjs';
const source = await readFile('src/domain/torrents.ts', 'utf8');
const fields = [
  ...new Set(
    ['BASE_FIELDS', 'DYNAMIC_FIELDS'].flatMap((name) => {
      const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`));
      assert.ok(match, `${name} literal list expected`);
      return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    }),
  ),
];
const { code } = await transformWithEsbuild(
  await readFile('src/services/rpc.ts', 'utf8'),
  'rpc.ts',
  { loader: 'ts', target: 'es2022' },
);
await mkdir('.lab', { recursive: true });
await writeFile('.lab/table-rpc.mjs', code);
const { RpcClient } = await import('../.lab/table-rpc.mjs');
const results = [];
for (const [port, version] of [
  [19091, '3.00'],
  [19092, '4.0.0'],
  [19093, '4.0.6'],
  [19095, '4.1.4'],
]) {
  const client = new RpcClient(`http://127.0.0.1:${port}/transmission/rpc`),
    session = await client.session();
  assert.ok(session.version.startsWith(version));
  const data = fixture(`twui-table-${version}-${Date.now()}`);
  let hash;
  try {
    const added = await client.call('torrent-add', { metainfo: data.metainfo, paused: true });
    hash = added['torrent-added'].hashString;
    assert.equal(hash, data.hash);
    const row = (await client.torrents(fields, [hash])).torrents[0];
    assert.equal(row.hashString, hash);
    assert.equal(row.name.startsWith('twui-table-'), true);
    for (const field of fields) assert.ok(Object.hasOwn(row, field), `${version} missing ${field}`);
    assert.ok(row.trackers.length > 0);
    assert.equal(typeof row.downloadDir, 'string');
    assert.equal(typeof row.totalSize, 'number');
    results.push({
      version: session.version,
      rpc: session['rpc-version'],
      fields,
      row,
      scope:
        'one isolated paused metainfo fixture; initial daemon verification may be queued; no compare writes',
    });
  } finally {
    if (hash) await client.call('torrent-remove', { ids: [hash], 'delete-local-data': false });
  }
}
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/table-fields-results.json', JSON.stringify(results, null, 2) + '\n');
console.log(
  results
    .map((r) => `${r.version}: all ${fields.length} fields present on nonempty isolated fixture`)
    .join('\n'),
);
