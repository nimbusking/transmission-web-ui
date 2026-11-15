import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import { bencode } from '../tests/fixtures/torrent.mjs';
const base = '.lab/comparison',
  name = '对照-H-大分块预览',
  directory = '/data/comparison/piece-preview-h';
const count = 4096,
  pieceSize = 16384,
  totalSize = count * pieceSize;
const complete = (index) => index < 1024 || (index < 3072 && index % 8 < 4);
const hashes = [],
  expected = Buffer.alloc(count / 8);
for (let i = 0; i < count; i++) {
  hashes.push(
    createHash('sha1')
      .update(Buffer.alloc(pieceSize, (i % 251) + 1))
      .digest(),
  );
  if (complete(i)) expected[i >> 3] |= 128 >> (i % 8);
}
const info = {
  name,
  length: totalSize,
  'piece length': pieceSize,
  pieces: Buffer.concat(hashes),
  private: 1,
};
const hash = createHash('sha1').update(bencode(info)).digest('hex');
const metainfo = bencode({ announce: 'http://modern:8080/comparison/announce', info });
await mkdir(`${base}/fixtures`, { recursive: true });
const { code } = await transformWithEsbuild(
  await readFile('src/services/rpc.ts', 'utf8'),
  'rpc.ts',
  { loader: 'ts', target: 'es2022' },
);
await writeFile(`${base}/piece-rpc.mjs`, code);
const { RpcClient } = await import('../.lab/comparison/piece-rpc.mjs');
const rpc = new RpcClient('http://127.0.0.1:19081/transmission/rpc');
const manifestPath = `${base}/piece-preview.json`;
let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (manifest) {
  assert.equal(manifest.owner, 'twui-compare-piece-preview');
  assert.equal(manifest.hash, hash);
}
const fields = ['id', 'hashString', 'name', 'downloadDir', 'status', 'percentDone'];
const before = (await rpc.torrents(fields)).torrents;
const existing = before.find((x) => x.hashString === hash);
if (existing) {
  assert.ok(manifest, 'Refusing to adopt an existing task without our manifest');
  assert.equal(existing.name, name);
  assert.equal(existing.downloadDir, directory);
} else {
  if (!manifest) {
    manifest = {
      owner: 'twui-compare-piece-preview',
      hash,
      name,
      directory,
      totalSize,
      pieceSize,
      pieceCount: count,
      state: 'planned',
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
  const fileStats = JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '-p',
        'twui-compare',
        '-f',
        'lab/compare.compose.yaml',
        'exec',
        '-T',
        'transmission',
        'python3',
        '-c',
        `import sys,json,os
from pathlib import Path
spec=json.load(sys.stdin)
root=Path('/data/comparison/piece-preview-h')
assert spec['directory']==str(root) and '/' not in spec['name']
p=root/spec['name']
if root.exists():
 assert root.is_dir() and not root.is_symlink() and p.is_file() and not p.is_symlink(), 'Existing unrecognized path'
 marker=root/'.twui-piece-preview-owner'
 assert marker.is_file() and not marker.is_symlink() and marker.read_text()==spec['hash'], 'Unowned sample directory'
 assert p.stat().st_size==4096*16384
 with p.open('rb') as f:
  for i in range(4096):
   available=i<1024 or (i<3072 and i%8<4)
   assert f.read(16384)==bytes([i%251+1 if available else 0])*16384, 'Existing data was modified; refusing overwrite'
else:
 root.mkdir(parents=False,exist_ok=False)
 with (root/'.twui-piece-preview-owner').open('x') as marker: marker.write(spec['hash'])
 with p.open('xb') as f:
  f.truncate(4096*16384)
  for i in range(4096):
   if i<1024 or (i<3072 and i%8<4):
    f.seek(i*16384);f.write(bytes([i%251+1])*16384)
  f.flush();os.fsync(f.fileno())
s=p.stat();print(json.dumps({'logicalBytes':s.st_size,'allocatedBytes':s.st_blocks*512}))`,
      ],
      { input: JSON.stringify({ directory, name, hash }), encoding: 'utf8' },
    ),
  );
  manifest.fileStats = fileStats;
  manifest.state = 'prepared';
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(`${base}/fixtures/piece-preview-h.torrent`, metainfo);
  const result = await rpc.call('torrent-add', {
    metainfo: metainfo.toString('base64'),
    paused: true,
    'download-dir': directory,
  });
  assert.equal(
    result['torrent-added']?.hashString,
    hash,
    'Expected our new task, not an existing duplicate',
  );
  manifest.state = 'added';
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await rpc.call('torrent-verify', { ids: [hash] });
}
let row;
const detailFields = [
  'id',
  'hashString',
  'name',
  'downloadDir',
  'status',
  'totalSize',
  'pieceSize',
  'pieceCount',
  'percentDone',
  'pieces',
  'haveValid',
  'haveUnchecked',
  'leftUntilDone',
];
for (let i = 0; i < 300; i++) {
  row = (await rpc.torrents(detailFields, [hash])).torrents[0];
  assert.ok(row, 'Sample task disappeared');
  if (
    row.status === 0 &&
    row.percentDone === 0.5 &&
    Buffer.from(row.pieces, 'base64').equals(expected)
  )
    break;
  if (existing) throw new Error('Existing sample changed; refusing to reverify or modify it');
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal(row.status, 0);
assert.equal(row.totalSize, totalSize);
assert.equal(row.pieceCount, count);
assert.equal(row.pieceSize, pieceSize);
assert.equal(row.percentDone, 0.5);
assert.ok(Buffer.from(row.pieces, 'base64').equals(expected));
const after = (await rpc.torrents(fields)).torrents;
const unchanged = before
  .filter((x) => x.hashString !== hash)
  .every(
    (x) => JSON.stringify(after.find((y) => y.hashString === x.hashString)) === JSON.stringify(x),
  );
const result = {
  ...manifest,
  state: 'verified',
  row,
  expectedCompletePieces: 2048,
  cells: { complete: 128, partial: 256, missing: 128 },
  existingTasksUnchanged: unchanged,
  existingTaskCount: before.filter((x) => x.hashString !== hash).length,
  taskCount: after.length,
  added: !existing,
  at: new Date().toISOString(),
};
await writeFile(manifestPath, JSON.stringify(result, null, 2) + '\n');
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/piece-preview-results.json', JSON.stringify(result, null, 2) + '\n');
assert.ok(
  unchanged,
  'Existing task state changed during sampling; not restoring or writing those tasks',
);
console.log(
  JSON.stringify(
    {
      name,
      hash,
      id: row.id,
      totalSize,
      pieceCount: count,
      percentDone: row.percentDone,
      status: row.status,
      existingTasksUnchanged: unchanged,
      added: !existing,
      fileStats: result.fileStats,
    },
    null,
    2,
  ),
);
