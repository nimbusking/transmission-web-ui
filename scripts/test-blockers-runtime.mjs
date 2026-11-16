import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, link } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import { bencode } from '../tests/fixtures/torrent.mjs';

const root = process.cwd(),
  directory = `${root}/.lab/blockers-runtime`,
  stamp = Date.now(),
  network = `twui-setting-runtime-${stamp}`,
  owned = [];
await mkdir(directory);
await mkdir(`${directory}/data`);
const { code } = await transformWithEsbuild(
  await readFile('src/services/rpc.ts', 'utf8'),
  'rpc.ts',
  {
    loader: 'ts',
    target: 'es2022',
  },
);
await writeFile(`${directory}/rpc.mjs`, code);
const { RpcClient } = await import('../.lab/blockers-runtime/rpc.mjs');
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const comparison = new RpcClient('http://127.0.0.1:19081/transmission/rpc');
async function protectedState() {
  const session = await comparison.session();
  delete session['download-dir-free-space'];
  return {
    tasks: (
      await comparison.torrents([
        'id',
        'hashString',
        'name',
        'status',
        'percentDone',
        'downloadDir',
        'totalSize',
      ])
    ).torrents,
    session,
    containers: docker([
      'inspect',
      '--format',
      '{{.Name}} {{.State.StartedAt}} {{.RestartCount}}',
      'twui-compare-legacy-1',
      'twui-compare-modern-1',
      'twui-compare-transmission-1',
    ]),
  };
}
const before = process.env.TWUI_GUARD_COMPARISON === '1' ? await protectedState() : undefined;
const payload = Buffer.alloc(64 * 1024 * 1024);
for (let i = 0; i < payload.length; i++) payload[i] = (i * 17 + Math.floor(i / 65536)) % 251;
await writeFile(`${directory}/data/payload`, payload);
const pieces = [];
for (let i = 0; i < payload.length; i += 65536)
  pieces.push(
    createHash('sha1')
      .update(payload.subarray(i, i + 65536))
      .digest(),
  );
const cases = [];
for (const [index, version] of ['3.00', '4.0.6', '4.1.4'].entries()) {
  const name = `blockers-runtime-${version}.bin`;
  try {
    await link(`${directory}/data/payload`, `${directory}/data/${name}`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const info = {
    name,
    length: payload.length,
    'piece length': 65536,
    pieces: Buffer.concat(pieces),
    private: 1,
  };
  cases.push({
    version,
    port: 19891 + index,
    hash: createHash('sha1').update(bencode(info)).digest('hex'),
    metainfo: bencode({ announce: 'http://fixture:8080/announce', info }).toString('base64'),
  });
}
const queue = {};
for (const version of ['3.00', '4.1.4']) {
  queue[version] = [];
  for (let i = 0; i < 3; i++) {
    const name = `blockers-queue-${version}-${i}.bin`;
    await link(`${directory}/data/payload`, `${directory}/data/${name}`);
    const info = {
      name,
      length: payload.length,
      'piece length': 65536,
      pieces: Buffer.concat(pieces),
      private: 1,
    };
    queue[version].push({
      hash: createHash('sha1').update(bencode(info)).digest('hex'),
      metainfo: bencode({ announce: 'http://fixture:8080/announce', info }).toString('base64'),
    });
  }
}
await writeFile(`${directory}/queue.json`, JSON.stringify(queue));
await writeFile(`${directory}/cases.json`, JSON.stringify(cases));
const web = `${root}/dist`;
await readFile(`${web}/index.html`);
function daemon(label, version, port) {
  const name = `${label}-${stamp}`;
  docker([
    'run',
    '-d',
    '--name',
    name,
    '--network',
    network,
    '-p',
    `127.0.0.1:${port}:9091`,
    '--tmpfs',
    '/config',
    '--tmpfs',
    '/data',
    '-e',
    'TZ=UTC',
    '-e',
    'OPENSSL_CONF=/openssl-3-legacy.cnf',
    '-v',
    `${root}/lab/openssl-3-legacy.cnf:/openssl-3-legacy.cnf:ro,z`,
    '-v',
    `${directory}/data:/seeddata:ro,z`,
    '-v',
    `${web}:/webui:ro,z`,
    `twui-lab/transmission:${version}`,
  ]);
  owned.push(name);
}
let exitCode = 1;
try {
  docker(['network', 'create', network]);
  const tracker = `blockers-runtime-tracker-${stamp}`;
  docker([
    'run',
    '-d',
    '--name',
    tracker,
    '--network',
    network,
    '--network-alias',
    'fixture',
    '-v',
    `${root}/lab/fixture-server.py:/tracker.py:ro,z`,
    '--entrypoint',
    'python3',
    'twui-lab/transmission:4.1.4',
    '/tracker.py',
  ]);
  owned.push(tracker);
  daemon('blockers-runtime-source', '4.1.4', 19896);
  for (const c of cases) daemon(`blockers-runtime-${c.version}`, c.version, c.port);
  const source = new RpcClient('http://127.0.0.1:19896/transmission/rpc');
  for (let i = 0; ; i++) {
    try {
      await source.session();
      break;
    } catch (error) {
      if (i === 99) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await source.call('session-set', {
    'utp-enabled': false,
    seedRatioLimited: false,
    'speed-limit-up-enabled': false,
  });
  console.log('Fresh three-version environment ready; source uses TCP; comparison is protected.');
  const child = spawn(
    'sh',
    [
      'scripts/test-browsers-docker.sh',
      '--config=playwright.blockers-runtime.config.ts',
      '--output=.lab/blockers-runtime-results',
    ],
    { stdio: 'inherit' },
  );
  exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
} finally {
  for (const name of owned.reverse()) docker(['rm', '-f', name]);
  docker(['network', 'rm', network]);
  const after = before ? await protectedState() : undefined;
  await writeFile(
    'artifacts/blockers-runtime-environment.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        exitCode,
        dedicatedNetwork: true,
        localPrivatePayloadBytes: payload.length,
        sourceUtpEnabled: false,
        temporaryContainersCleaned: true,
        comparisonGuarded: !!before,
        comparisonUnchanged: before ? JSON.stringify(before) === JSON.stringify(after) : undefined,
      },
      null,
      2,
    ) + '\n',
  );
  if (before) assert.deepEqual(after, before);
}
process.exitCode = exitCode;
