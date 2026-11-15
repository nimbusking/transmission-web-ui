import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import { fixture } from '../tests/fixtures/torrent.mjs';
const { code } = await transformWithEsbuild(
  await readFile('src/services/rpc.ts', 'utf8'),
  'rpc.ts',
  { loader: 'ts', target: 'es2022' },
);
await mkdir('.lab', { recursive: true });
await writeFile('.lab/controls-rpc.mjs', code);
const { RpcClient } = await import('../.lab/controls-rpc.mjs'),
  results = [];
for (const port of [19091, 19092, 19093, 19095]) {
  const client = new RpcClient(`http://127.0.0.1:${port}/transmission/rpc`),
    hashes = [];
  const read = async (hash) =>
    (
      await client.torrents(
        [
          'id',
          'hashString',
          'status',
          'queuePosition',
          'metadataPercentComplete',
          'downloadLimit',
          'downloadLimited',
          'uploadLimit',
          'uploadLimited',
          'seedRatioMode',
          'seedRatioLimit',
          'honorsSessionLimits',
        ],
        [hash],
      )
    ).torrents[0];
  const waitPaused = async (hash) => {
    for (let i = 0; i < 100; i++) {
      if ((await read(hash)).status === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Paused state timeout');
  };
  try {
    for (const suffix of ['a', 'b']) {
      const data = fixture(`twui-controls-${port}-${Date.now()}-${suffix}`),
        added = (await client.call('torrent-add', { metainfo: data.metainfo, paused: true }))[
          'torrent-added'
        ];
      hashes.push(added.hashString);
    }
    const magnet = fixture(`twui-magnet-${port}-${Date.now()}`);
    const added = (
      await client.call('torrent-add', {
        filename: `magnet:?xt=urn:btih:${magnet.hash}&dn=Local`,
        paused: true,
      })
    )['torrent-added'];
    hashes.push(added.hashString);
    assert.equal(added.hashString.toLowerCase(), magnet.hash);
    assert.equal((await read(added.hashString)).metadataPercentComplete, 0);
    await waitPaused(hashes[0]);
    const ids = [hashes[0]];
    for (const [method, expected] of [
      ['queue-move-top', 0],
      ['queue-move-down', 1],
      ['queue-move-up', 0],
    ]) {
      await client.call(method, { ids });
      assert.equal((await read(hashes[0])).queuePosition, expected);
    }
    await client.call('queue-move-bottom', { ids });
    assert.equal(
      (await read(hashes[0])).queuePosition,
      (await client.torrents(['id'])).torrents.length - 1,
    );
    const limits = {
      downloadLimit: 41,
      downloadLimited: true,
      uploadLimit: 23,
      uploadLimited: true,
      seedRatioMode: 1,
      seedRatioLimit: 1.5,
      honorsSessionLimits: false,
    };
    await client.call('torrent-set', { ids, ...limits });
    const limited = await read(hashes[0]);
    for (const [key, value] of Object.entries(limits)) assert.equal(limited[key], value);
    await client.call('torrent-start-now', { ids });
    assert.notEqual((await read(hashes[0])).status, 0);
    await client.call('torrent-reannounce', { ids });
    await client.call('torrent-stop', { ids });
    await waitPaused(hashes[0]);
    results.push({
      version: (await client.session()).version,
      magnetAccepted: true,
      queueDirections: 4,
      taskLimitsReadBack: true,
      startNowStop: true,
      reannounceAcknowledged: true,
      result: 'passed',
    });
  } finally {
    for (const hash of hashes)
      await client.call('torrent-remove', { ids: [hash], 'delete-local-data': true });
  }
}
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/controls-results.json',
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
console.log(results);
