import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { transformWithEsbuild } from 'vite';
import { bencode } from '../tests/fixtures/torrent.mjs';
const root = process.cwd(),
  stamp = Date.now(),
  label = `twui-installer-${stamp}`,
  base = `${root}/.lab/${label}`;
await mkdir(`${base}/old-web`, { recursive: true });
await writeFile(`${base}/old-web/index.html`, '<html>Original UI for installer test</html>');
await writeFile(`${base}/old-web/original-resource.txt`, 'Keep this entire old resource tree');
const docker = (args) =>
  execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim();
const image =
  'mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579';
const name = `${label}-daemon`,
  prefix = `${base}/ui`,
  archive = `${root}/artifacts/installer-2.0.0-installer.3/transmission-web-ui.tar.gz`;
const results = [];
const pageText = async (url) => {
  for (let i = 0; ; i++) {
    try {
      return await (await fetch(url, { headers: { connection: 'close' } })).text();
    } catch (e) {
      if (i === 5) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
};
const harness = (args, interrupt = false) =>
  docker([
    'run',
    '--init',
    '--rm',
    '--security-opt',
    'label=disable',
    '--network',
    'host',
    '--user',
    '0',
    '-v',
    `${root}:${root}:z`,
    '-v',
    '/var/run/docker.sock:/var/run/docker.sock',
    '-v',
    '/usr/bin/docker:/usr/bin/docker:ro',
    '-w',
    root,
    image,
    ...(interrupt
      ? ['sh', '-c', 'export PATH="$1:$PATH"; shift; exec sh "$@"', 'sh', `${base}/fault-bin`]
      : ['sh']),
    `${root}/artifacts/installer-2.0.0-installer.3/install-transmission-web-ui.sh`,
    ...args,
  ]);
const inspect = (name) => JSON.parse(docker(['inspect', name]))[0];
let rpc;
const socket = createServer();
await new Promise((r) => socket.listen(0, '127.0.0.1', r));
const hostPort = socket.address().port;
await new Promise((r) => socket.close(r));
try {
  docker([
    'run',
    '-d',
    '--name',
    name,
    '--label',
    `twui-installer-test=${label}`,
    '--label',
    'com.docker.compose.project=',
    '--label',
    'com.docker.compose.service=',
    '--hostname',
    'preserved-host',
    '--restart',
    'unless-stopped',
    '--env',
    'CUSTOM_MARKER=preserve-me',
    '--env',
    'TR_INITIAL_SETTINGS_ONLY=1',
    '--mount',
    `type=bind,source=${base}/old-web,target=/webui,readonly`,
    '--volume',
    '/config',
    '--volume',
    '/data',
    '-p',
    `127.0.0.1:${hostPort}:9091`,
    'twui-lab/transmission:4.1.4',
  ]);
  const before = inspect(name),
    port = before.NetworkSettings.Ports['9091/tcp'][0].HostPort;
  const endpoint = `http://127.0.0.1:${port}/transmission/web/`;
  const { code } = await transformWithEsbuild(
    await readFile('src/services/rpc.ts', 'utf8'),
    'rpc.ts',
    { loader: 'ts', target: 'es2022' },
  );
  await writeFile(`${base}/rpc.mjs`, code);
  const { RpcClient } = await import(`${base}/rpc.mjs`);
  rpc = new RpcClient(`http://127.0.0.1:${port}/transmission/rpc`);
  for (let i = 0; ; i++) {
    try {
      await rpc.session();
      break;
    } catch (e) {
      if (i > 100) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const info = {
    name: 'installer-preserve-task.bin',
    length: 16384,
    'piece length': 16384,
    pieces: createHash('sha1').update(Buffer.alloc(16384, 7)).digest(),
    private: 1,
  };
  await rpc.call('torrent-add', {
    metainfo: bencode({ announce: 'http://127.0.0.1:1/announce', info }).toString('base64'),
    paused: true,
    'download-dir': '/data',
  });
  docker(['exec', name, 'sh', '-c', 'printf preserve-download-data > /data/installer-sentinel']);
  const taskSnapshot = (await rpc.torrents(['hashString', 'name', 'status'])).torrents;
  const session = await rpc.session();
  delete session['download-dir-free-space'];
  delete session['session-id'];
  const args = [
    '--mode',
    'docker',
    '--container',
    name,
    '--prefix',
    prefix,
    '--endpoint',
    endpoint,
    '--yes',
  ];
  // Unknown writable-layer files must be rejected before stopping the daemon.
  docker(['exec', name, 'sh', '-c', 'printf preserve > /unpersisted-user-file']);
  assert.throws(() => harness(args), /原容器可写层不能丢弃/);
  assert.equal(inspect(name).Id, before.Id);
  assert.equal(inspect(name).State.Running, true);
  docker(['exec', name, 'rm', '/unpersisted-user-file']);
  results.push({ case: 'unpersisted-layer-refused-without-stop', passed: true });
  await rpc.call('session-set', { 'download-dir': '/not-persisted-yet' });
  assert.throws(() => harness(args), /目录未位于持久化挂载内/);
  assert.equal(inspect(name).State.Running, true);
  await rpc.call('session-set', { 'download-dir': session['download-dir'] });
  results.push({ case: 'unmounted-download-directory-refused', passed: true });
  // Kill the installer immediately after it stops its own original container.
  // This is a real uncatchable interruption, not a hand-crafted journal.
  await mkdir(`${base}/fault-bin`);
  await writeFile(
    `${base}/fault-bin/docker`,
    '#!/bin/sh\n/usr/bin/docker "$@"\nrc=$?\nif [ "$rc" = 0 ] && [ "$1" = stop ]; then kill -KILL "$PPID"; fi\nexit "$rc"\n',
    { mode: 0o755 },
  );
  assert.throws(() => harness(args, true));
  const pending = docker([
    'run',
    '--rm',
    '-v',
    `${base}:${base}`,
    image,
    'cat',
    `${base}/.twui-backups-ui/pending`,
  ]);
  assert.equal(inspect(before.Id).State.Running, false);
  results.push({
    case: 'sigkill-after-stop-recovery',
    output: harness(['--restore', `${base}/.twui-backups-ui/${pending}`, '--yes']),
  });
  assert.equal(inspect(name).Id, before.Id);
  assert.equal(inspect(name).State.Running, true);
  const output = harness(args);
  console.log(output);
  results.push({ case: 'docker-install', output });
  const after = inspect(name);
  assert.notEqual(after.Id, before.Id);
  assert.equal(after.Config.Hostname, before.Config.Hostname);
  assert(after.Config.Env.includes('CUSTOM_MARKER=preserve-me'));
  assert.equal(after.HostConfig.RestartPolicy.Name, 'unless-stopped');
  for (const m of before.Mounts)
    assert(
      after.Mounts.some((n) => n.Source === m.Source && n.Destination === m.Destination),
      `Lost mount ${m.Destination}`,
    );
  let currentSession;
  for (let i = 0; ; i++) {
    try {
      currentSession = await rpc.session();
      break;
    } catch (e) {
      if (i > 10) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  delete currentSession['download-dir-free-space'];
  delete currentSession['session-id'];
  assert.deepEqual(currentSession, session);
  assert.deepEqual((await rpc.torrents(['hashString', 'name', 'status'])).torrents, taskSnapshot);
  assert.equal(docker(['exec', name, 'cat', '/data/installer-sentinel']), 'preserve-download-data');
  assert.equal(inspect(before.Id).State.Running, false);
  const index = await pageText(endpoint);
  assert.equal(
    createHash('sha256').update(index).digest('hex'),
    createHash('sha256')
      .update(execFileSync('tar', ['-xOf', archive, 'web/index.html']))
      .digest('hex'),
  );
  const backupRoot = `${base}/.twui-backups-ui`;
  const latest = docker([
    'run',
    '--rm',
    '-v',
    `${base}:${base}`,
    image,
    'cat',
    `${backupRoot}/latest`,
  ]);
  await writeFile(`${base}/old-web/original-resource.txt`, 'externally changed');
  assert.throws(() => harness(['--restore', `${backupRoot}/${latest}`, '--yes']), /恢复尚未完成/);
  assert.equal(inspect(name).Id, after.Id);
  assert.equal(inspect(name).State.Running, true);
  await writeFile(`${base}/old-web/original-resource.txt`, 'Keep this entire old resource tree');
  results.push({ case: 'changed-old-asset-keeps-current-service', passed: true });
  results.push({ case: 'same-version-reinstall', output: harness(args) });
  assert.equal(
    inspect(name).Id,
    after.Id,
    'Upgrade should retain the already integrated container',
  );
  // Simulate a lock left by a dead process; recovery must not require manual rm.
  docker([
    'run',
    '--rm',
    '-v',
    `${base}:${base}`,
    image,
    'sh',
    '-c',
    'mkdir "$1/.lock"; printf 99999999 > "$1/.lock/pid"; printf 0 > "$1/.lock/start"',
    'sh',
    backupRoot,
  ]);
  results.push({
    case: 'explicit-restore-original',
    output: harness(['--restore', `${backupRoot}/${latest}`, '--yes']),
  });
  assert.equal(inspect(name).Id, before.Id);
  assert.equal(await pageText(endpoint), '<html>Original UI for installer test</html>');
  // The image intentionally ignores the supplied Web override. It must roll back, not report success.
  const badName = `${label}-ignores-override`;
  const s = createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const badPort = s.address().port;
  await new Promise((r) => s.close(r));
  docker([
    'run',
    '-d',
    '--name',
    badName,
    '--label',
    `twui-installer-test=${label}`,
    '--label',
    'com.docker.compose.project=',
    '--label',
    'com.docker.compose.service=',
    '--env',
    'TR_INITIAL_SETTINGS_ONLY=1',
    '--mount',
    `type=bind,source=${base}/old-web,target=/webui,readonly`,
    '--volume',
    '/config',
    '--volume',
    '/data',
    '-p',
    `127.0.0.1:${badPort}:9091`,
    '--entrypoint',
    'sh',
    'twui-lab/transmission:4.1.4',
    '-c',
    'export TRANSMISSION_WEB_HOME=/webui; exec python3 /entrypoint.py',
  ]);
  const badId = inspect(badName).Id,
    badEndpoint = `http://127.0.0.1:${badPort}/transmission/web/`;
  await pageText(badEndpoint);
  let failure;
  try {
    harness([
      '--mode',
      'docker',
      '--container',
      badName,
      '--prefix',
      `${base}/ui-fail`,
      '--endpoint',
      badEndpoint,
      '--archive',
      archive,
      '--yes',
    ]);
  } catch (e) {
    failure = e;
  }
  assert(failure, 'Expected an image overriding Web home to fail verification');
  assert.match(failure.stdout, /已恢复原界面/);
  assert.equal(inspect(badName).Id, badId);
  assert.equal(await pageText(badEndpoint), '<html>Original UI for installer test</html>');
  results.push({
    case: 'failed-web-validation-auto-rollback',
    output: failure.stdout,
    stderr: failure.stderr,
  });
  harness(args);
  const missingCurrent = inspect(name).Id;
  const missingBackup = docker([
    'run',
    '--rm',
    '-v',
    `${base}:${base}`,
    image,
    'cat',
    `${backupRoot}/latest`,
  ]);
  docker(['rm', before.Id]); // Only this test's retained, stopped original; never delete volumes.
  assert.throws(
    () => harness(['--restore', `${backupRoot}/${missingBackup}`, '--yes']),
    /恢复尚未完成/,
  );
  assert.equal(inspect(name).Id, missingCurrent);
  assert.equal(inspect(name).State.Running, true);
  results.push({ case: 'missing-original-keeps-current-service', passed: true });
  await writeFile(
    'artifacts/integrated-installer-recheck-results.json',
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + '\n',
  );
  console.log(
    'Integrated Docker install, configuration/volume preservation, repeat installation and restore passed.',
  );
} finally {
  await writeFile(
    'artifacts/integrated-installer-recheck-results.json',
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + '\n',
  );
  const ids = docker(['ps', '-aq', '--filter', `label=twui-installer-test=${label}`])
    .split('\n')
    .filter(Boolean);
  const volumes = new Set();
  for (const id of ids) {
    for (const m of inspect(id).Mounts) if (m.Type === 'volume') volumes.add(m.Name);
  }
  if (ids.length) docker(['rm', '-f', ...ids]);
  for (const volume of volumes) docker(['volume', 'rm', volume]);
  docker([
    'run',
    '--rm',
    '-v',
    `${base}:${base}`,
    image,
    'sh',
    '-c',
    'rm -rf "$1"/ui "$1"/.twui-backups-ui "$1"/ui-fail "$1"/.twui-backups-ui-fail',
    'sh',
    base,
  ]);
}
