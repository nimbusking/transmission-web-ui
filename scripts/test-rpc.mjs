import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import { fixture } from '../tests/fixtures/torrent.mjs';
// Exercise the production client, not a second implementation of the protocol.
const { code } = await transformWithEsbuild(
  await readFile('src/services/rpc.ts', 'utf8'),
  'rpc.ts',
  { loader: 'ts', target: 'es2022' },
);
await mkdir('.lab', { recursive: true });
await writeFile('.lab/rpc.mjs', code);
const { RpcClient } = await import('../.lab/rpc.mjs');
const results = [];
for (const [port, version] of [
  [19091, '3.00'],
  [19092, '4.0.0'],
  [19093, '4.0.6'],
  [19095, '4.1.4'],
]) {
  const client = new RpcClient(`http://127.0.0.1:${port}/transmission/rpc`),
    session = await client.session();
  console.log(`Testing Transmission ${session.version}`);
  assert.ok(
    session.version.startsWith(version),
    `Expected ${version}, received ${session.version}`,
  );
  const data = fixture(`twui-regression-${version}-${Date.now()}`);
  let hash;
  const originalLimits = {
    'peer-limit-global': session['peer-limit-global'],
    'speed-limit-up': session['speed-limit-up'],
    'speed-limit-up-enabled': session['speed-limit-up-enabled'],
  };
  const service = { 19091: 'tr3', 19092: 'tr4-base', 19093: 'tr4', 19095: 'tr4-current' }[port];
  const runPython = (source) =>
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
  const fileName = `twui-regression-${version}-${Date.now()}`;
  const get = async (fields) =>
    (await client.torrents(['id', 'hashString', ...fields], [hash])).torrents[0];
  const wait = async (predicate) => {
    for (let i = 0; i < 100; i++) {
      const row = await get(['status', 'files', 'downloadDir']);
      if (predicate(row)) return row;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Daemon state timeout');
  };
  try {
    const added = await client.call('torrent-add', {
      metainfo: data.metainfo,
      paused: true,
      'download-dir': '/data/regression',
    });
    hash = added['torrent-added'].hashString;
    assert.equal(hash.toLowerCase(), data.hash);
    let duplicateResponse;
    try {
      duplicateResponse = await client.call('torrent-add', {
        metainfo: data.metainfo,
        paused: true,
      });
      assert.ok(duplicateResponse['torrent-duplicate']);
    } catch (error) {
      assert.equal(error.kind, 'business');
      assert.equal(error.message, 'duplicate torrent');
      duplicateResponse = { result: error.message };
    }
    await assert.rejects(client.call('torrent-add', { metainfo: 'invalid' }), { kind: 'business' });
    await wait((row) => row.status === 0);
    const row = await get(['files', 'wanted', 'trackers', 'status']);
    assert.equal(row.status, 0);
    assert.equal(row.files.length, 1);
    await client.call('torrent-set', { ids: [hash], 'files-unwanted': [0], 'priority-high': [0] });
    const unwanted = await get(['wanted', 'fileStats']);
    assert.equal(Boolean(unwanted.wanted[0]), false);
    assert.equal(unwanted.fileStats[0].priority, 1);
    await client.call('torrent-set', { ids: [hash], 'files-wanted': [0] });
    assert.equal(Boolean((await get(['wanted'])).wanted[0]), true);
    const a = 'http://127.0.0.1:19999/announce',
      b = 'http://127.0.0.2:19998/announce',
      c = 'http://127.0.0.3:19997/announce';
    if (session['rpc-version'] >= 17) {
      await client.call('torrent-set', { ids: [hash], trackerList: `${a}\n${b}\n\n${c}` });
      const trackers = (await get(['trackers'])).trackers;
      assert.equal(trackers.length, 3);
      assert.equal(trackers[0].tier, trackers[1].tier);
      assert.notEqual(trackers[1].tier, trackers[2].tier);
    } else {
      await client.call('torrent-set', { ids: [hash], trackerAdd: [b, c] });
      const trackers = (await get(['trackers'])).trackers;
      await client.call('torrent-set', { ids: [hash], trackerRemove: [trackers[0].id] });
      const retained = (await get(['trackers'])).trackers;
      await client.call('torrent-set', {
        ids: [hash],
        trackerReplace: [retained[0].id, 'http://127.0.0.1:19996/announce'],
      });
      assert.ok((await get(['trackers'])).trackers.some((x) => x.announce.includes('19996')));
    }
    await client.call('torrent-set-location', {
      ids: [hash],
      location: '/data/located',
      move: false,
    });
    await wait((row) => row.downloadDir === '/data/located');
    const fixtureName = row.files[0].name;
    runPython(
      `from pathlib import Path; import base64; p=Path('/data/located'); p.mkdir(exist_ok=True); (p/${JSON.stringify(fixtureName)}).write_bytes(base64.b64decode(${JSON.stringify(data.payload.toString('base64'))}))`,
    );
    await client.call('torrent-verify', { ids: [hash] });
    await wait((row) => row.status === 0 && row.files[0].bytesCompleted === data.payload.length);
    await client.call('torrent-rename-path', { ids: [hash], path: fixtureName, name: fileName });
    await wait((row) => row.files[0].name === fileName);
    await client.call('torrent-set-location', { ids: [hash], location: '/data/moved', move: true });
    await wait((row) => row.downloadDir === '/data/moved');
    runPython(
      `from pathlib import Path; assert (Path('/data/moved')/${JSON.stringify(fileName)}).read_bytes()==${JSON.stringify(data.payload.toString())}.encode()`,
    );
    await client.call('torrent-start', { ids: [hash] });
    await wait((row) => row.status !== 0);
    await client.call('torrent-stop', { ids: [hash] });
    await wait((row) => row.status === 0);
    const space = await client.call('free-space', { path: '/data' });
    assert.ok(space['size-bytes'] >= 0);
    await client.call('session-set', {
      'peer-limit-global': originalLimits['peer-limit-global'] + 1,
      'speed-limit-up': 37,
      'speed-limit-up-enabled': true,
    });
    const changed = await client.session();
    assert.equal(changed['peer-limit-global'], originalLimits['peer-limit-global'] + 1);
    assert.equal(changed['speed-limit-up'], 37);
    assert.equal(changed['speed-limit-up-enabled'], true);
    await client.call('session-set', originalLimits);
    const after = await client.session();
    assert.equal(after['download-dir'], session['download-dir']);
    const web = await fetch(`http://127.0.0.1:${port}/transmission/web/`);
    assert.equal(web.status, 200);
    assert.match(await web.text(), /<div id="app">/);
    results.push({
      version: session.version,
      rpcVersion: session['rpc-version'],
      wantedType: typeof row.wanted[0],
      duplicateResponse: duplicateResponse.result ?? 'torrent-duplicate',
      result: 'passed',
      checks: [
        '409',
        'metainfo',
        'duplicate',
        'invalid metainfo',
        'wanted',
        'priority',
        'tracker IDs/tiers',
        'locate',
        'verify',
        'start/stop',
        'default directory unchanged',
        'static web',
        'real file verification',
        'rename',
        'move data',
        'free-space',
        'session limit settings/restoration',
      ],
    });
  } finally {
    await client.call('session-set', originalLimits);
    if (hash) await client.call('torrent-remove', { ids: [hash], 'delete-local-data': true });
  }
}
for (const [port, version] of [
  [19094, '4.0.6'],
  [19090, '4.1.4'],
]) {
  const auth = new RpcClient(`http://127.0.0.1:${port}/transmission/rpc`);
  await assert.rejects(auth.session(), { kind: 'auth' });
  auth.authenticate('lab', 'lab-only-password');
  assert.ok((await auth.session()).version.startsWith(version));
  results.push({
    version,
    authentication: '401 then explicit Basic credentials',
    result: 'passed',
  });
}
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/rpc-results.json',
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
console.log(JSON.stringify(results, null, 2));
