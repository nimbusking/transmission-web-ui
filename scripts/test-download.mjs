import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import { bencode } from '../tests/fixtures/torrent.mjs';
await mkdir('.lab/fixtures', { recursive: true });
const name = `twui-local-download-${Date.now()}`,
  payload = Buffer.alloc(1024 * 1024);
for (let i = 0; i < payload.length; i++) payload[i] = (i * 31 + Math.floor(i / 16384)) % 256;
const pieces = [];
for (let i = 0; i < payload.length; i += 16384)
  pieces.push(
    createHash('sha1')
      .update(payload.subarray(i, i + 16384))
      .digest(),
  );
const info = {
  name,
  length: payload.length,
  'piece length': 16384,
  pieces: Buffer.concat(pieces),
  private: 1,
};
const torrent = bencode({ announce: 'http://fixture:8080/announce', info }),
  hash = createHash('sha1').update(bencode(info)).digest('hex');
await writeFile(`.lab/fixtures/${name}`, payload);
await writeFile(`.lab/fixtures/${name}.torrent`, torrent);
const compose = ['compose', '-p', 'twui-lab', '-f', 'lab/compose.yaml'];
execFileSync(
  'docker',
  [...compose, '--profile', 'fixtures', 'up', '-d', '--no-build', 'fixture', 'tr-seed'],
  { stdio: 'inherit' },
);
const { code } = await transformWithEsbuild(
  await readFile('src/services/rpc.ts', 'utf8'),
  'rpc.ts',
  { loader: 'ts', target: 'es2022' },
);
await writeFile('.lab/download-rpc.mjs', code);
const { RpcClient } = await import('../.lab/download-rpc.mjs');
const seed = new RpcClient('http://127.0.0.1:19096/transmission/rpc'),
  all = [seed],
  results = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(client, predicate) {
  for (let i = 0; i < 300; i++) {
    const row = (
      await client.torrents(['id', 'status', 'percentDone', 'files', 'errorString'], [hash])
    ).torrents[0];
    if (predicate(row)) return row;
    await sleep(200);
  }
  throw new Error('Local download timed out');
}
try {
  for (let i = 0; i < 40; i++) {
    try {
      await seed.session();
      break;
    } catch {
      await sleep(100);
    }
  }
  execFileSync('docker', [
    ...compose,
    'exec',
    '-T',
    'tr-seed',
    'python3',
    '-c',
    `import urllib.request; from pathlib import Path; Path('/data/${name}').write_bytes(urllib.request.urlopen('http://fixture:8080/files/${name}').read())`,
  ]);
  await seed.call('torrent-add', { metainfo: torrent.toString('base64'), paused: true });
  await wait(seed, (row) => row?.status === 0 && row.percentDone === 1);
  await seed.call('torrent-start', { ids: [hash] });
  for (const [port, service] of [
    [19091, 'tr3'],
    [19092, 'tr4-base'],
    [19093, 'tr4'],
    [19095, 'tr4-current'],
  ]) {
    const client = new RpcClient(`http://127.0.0.1:${port}/transmission/rpc`);
    all.push(client);
    // URL loading also exercises the real daemon's HTTP torrent-add path.
    await client.call('torrent-add', {
      filename: `http://fixture:8080/files/${name}.torrent`,
      paused: false,
    });
    await wait(client, (row) => row?.percentDone === 1);
    const digest = execFileSync(
      'docker',
      [...compose, 'exec', '-T', service, 'sha256sum', `/data/${name}`],
      { encoding: 'utf8' },
    ).split(' ')[0];
    assert.equal(digest, createHash('sha256').update(payload).digest('hex'));
    results.push({
      version: (await client.session()).version,
      bytes: payload.length,
      sha256: digest,
      result: 'passed',
    });
    await client.call('torrent-stop', { ids: [hash] });
  }
  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/download-results.json',
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );
  console.log(results);
} finally {
  for (const client of all)
    await client
      .call('torrent-remove', { ids: [hash], 'delete-local-data': true })
      .catch((error) => console.error('Fixture cleanup:', error.message));
}
