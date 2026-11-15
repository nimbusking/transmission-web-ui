import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import { bencode } from '../tests/fixtures/torrent.mjs';
const base = '.lab/comparison',
  reset = process.argv.includes('--reset');
await mkdir(`${base}/fixtures`, { recursive: true });
const { code } = await transformWithEsbuild(
  await readFile('src/services/rpc.ts', 'utf8'),
  'rpc.ts',
  { loader: 'ts', target: 'es2022' },
);
await writeFile(`${base}/rpc.mjs`, code);
const { RpcClient } = await import('../.lab/comparison/rpc.mjs');
const rpc = new RpcClient('http://127.0.0.1:19081/transmission/rpc');
let previous;
try {
  previous = JSON.parse(await readFile(`${base}/seed.json`, 'utf8'));
} catch {
  /* first start */
}
if (previous && !reset) {
  const existing = (await rpc.torrents(['id', 'hashString', 'name'])).torrents;
  console.log(
    `Comparison data retained (${existing.length} current tasks). Use npm run compare:reset to restore generated samples.`,
  );
} else {
  if (previous) {
    assert.equal(previous.owner, 'twui-compare');
    const current = (await rpc.torrents(['id', 'hashString'])).torrents;
    const hashes = current
      .filter((row) => previous.tasks.some((item) => item.hash === row.hashString))
      .map((row) => row.hashString);
    if (hashes.length)
      await rpc.call('torrent-remove', { ids: hashes, 'delete-local-data': false });
  }
  const bytes = (length, value) => Buffer.alloc(length, value);
  const specs = [
    {
      name: '对照-A-完整文件',
      directory: 'complete',
      files: [{ path: 'payload.bin', data: bytes(65536, 65), available: 65536 }],
      scenario: '100% complete, paused',
    },
    {
      name: '对照-B-等待下载',
      directory: 'empty',
      files: [{ path: 'payload.bin', data: bytes(65536, 66), available: 0 }],
      scenario: '0%, start/pause/queue candidate',
    },
    {
      name: '对照-C-部分数据',
      directory: 'partial',
      files: [{ path: 'payload.bin', data: bytes(65536, 67), available: 32768 }],
      scenario: '50%, verification and progress',
    },
    {
      name: '对照-D-多文件与中文',
      directory: 'multi',
      multi: true,
      files: [
        { path: '目录/完整.txt', data: bytes(16384, 68), available: 16384 },
        { path: '目录/部分.bin', data: bytes(32768, 69), available: 16384 },
        { path: '未下载.bin', data: bytes(16384, 70), available: 0 },
      ],
      scenario: 'file tree/index/wanted/priority/rename',
    },
    {
      name: '对照-E-目录匹配',
      directory: 'original',
      files: [{ path: 'payload.bin', data: bytes(65536, 71), available: 0 }],
      scenario: 'candidate-a partial; candidate-b complete',
    },
    {
      name: '对照-F-零字节文件',
      directory: 'zero',
      multi: true,
      files: [
        { path: '空文件.txt', data: Buffer.alloc(0), available: 0 },
        { path: 'readme.txt', data: bytes(32, 72), available: 32 },
      ],
      scenario: 'zero-length and completed multi-file torrent',
    },
    {
      name: '对照-G-手动添加',
      directory: 'manual',
      files: [{ path: 'payload.bin', data: bytes(65536, 73), available: 0 }],
      manual: true,
      scenario: 'file/URL add and duplicate',
    },
  ];
  const writes = [],
    tasks = [];
  for (const [index, spec] of specs.entries()) {
    const content = Buffer.concat(spec.files.map((file) => file.data)),
      pieces = [];
    for (let offset = 0; offset < content.length; offset += 16384)
      pieces.push(
        createHash('sha1')
          .update(content.subarray(offset, offset + 16384))
          .digest(),
      );
    const info = {
      name: spec.name,
      'piece length': 16384,
      pieces: Buffer.concat(pieces),
      private: 1,
      ...(spec.multi
        ? {
            files: spec.files.map((file) => ({
              length: file.data.length,
              path: file.path.split('/'),
            })),
          }
        : { length: content.length }),
    };
    const metainfo = bencode({ announce: 'http://modern:8080/comparison/announce', info }),
      hash = createHash('sha1').update(bencode(info)).digest('hex'),
      directory = `/data/comparison/${spec.directory}`,
      filename = spec.manual ? 'add-me.torrent' : `sample-${index + 1}.torrent`;
    await writeFile(`${base}/fixtures/${filename}`, metainfo);
    for (const file of spec.files) {
      const relative = spec.multi ? `${spec.name}/${file.path}` : spec.name;
      writes.push({
        path: `${directory}/${relative}`,
        content: file.data.subarray(0, file.available).toString('base64'),
        create: file.available > 0 || file.data.length === 0,
      });
      if (spec.directory === 'original') {
        for (const [candidate, available] of [
          ['candidate-a', 32768],
          ['candidate-b', file.data.length],
        ])
          writes.push({
            path: `/data/comparison/${candidate}/${relative}`,
            content: file.data.subarray(0, available).toString('base64'),
            create: true,
          });
      }
    }
    tasks.push({
      name: spec.name,
      hash,
      directory,
      filename,
      scenario: spec.scenario,
      manual: Boolean(spec.manual),
      expectedPercentDone:
        spec.files.reduce((sum, file) => sum + file.available, 0) / content.length,
      metainfo: metainfo.toString('base64'),
    });
  }
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
      `import sys,json,base64
from pathlib import Path
root=Path('/data/comparison')
for item in json.load(sys.stdin):
 p=Path(item['path'])
 assert p.is_relative_to(root) and '..' not in p.parts
 p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():
  assert p.is_file() and not p.is_symlink()
  p.unlink()
 if item['create']: p.write_bytes(base64.b64decode(item['content']))`,
    ],
    { input: JSON.stringify(writes) },
  );
  for (const task of tasks.filter((item) => !item.manual)) {
    const response = await rpc.call('torrent-add', {
      metainfo: task.metainfo,
      paused: true,
      'download-dir': task.directory,
    });
    const added = response['torrent-added'] || response['torrent-duplicate'];
    assert.equal(added.hashString, task.hash);
    await rpc.call('torrent-verify', { ids: [task.hash] });
    for (let i = 0; i < 100; i++) {
      const row = (
        await rpc.torrents(
          ['id', 'hashString', 'status', 'percentDone', 'metadataPercentComplete'],
          [task.hash],
        )
      ).torrents[0];
      if (
        row.status === 0 &&
        row.metadataPercentComplete === 1 &&
        Math.abs(row.percentDone - task.expectedPercentDone) < 0.0001
      ) {
        task.id = row.id;
        task.percentDone = row.percentDone;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(Number.isInteger(task.id), 'Sample verification timeout');
  }
  const manifest = {
    owner: 'twui-compare',
    at: new Date().toISOString(),
    tasks: tasks.map(({ metainfo: _metainfo, ...task }) => task),
    candidateDirectories: ['/data/comparison/candidate-a', '/data/comparison/candidate-b'],
    fileDownload: 'http://127.0.0.1:19081/comparison/fixtures/add-me.torrent',
    daemonAddUrl: 'http://modern:8080/comparison/fixtures/add-me.torrent',
  };
  await writeFile(`${base}/seed.json`, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}
