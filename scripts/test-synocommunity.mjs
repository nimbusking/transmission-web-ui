import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const root = process.cwd(),
  source = JSON.parse(await readFile('lab/synocommunity-sources.json', 'utf8')),
  cache = '.lab/synocommunity-upstream';
await mkdir(cache, { recursive: true });
for (const file of source.files) {
  const target = `${cache}/${file.name}`;
  let bytes;
  try {
    bytes = await readFile(target);
  } catch {
    /* Fetch the pinned test source only when absent. */
  }
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    execFileSync('curl', [
      '--fail',
      '--location',
      '--max-time',
      '45',
      '--output',
      target,
      `https://raw.githubusercontent.com/SynoCommunity/spksrc/${source.commit}/${file.path}`,
    ]);
    bytes = await readFile(target);
  }
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
}
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 60000 });
execFileSync(
  'docker',
  ['build', '-f', 'lab/Dockerfile.synocommunity', '-t', 'twui-lab/synocommunity:4.1.4-32', '.'],
  { stdio: 'inherit', timeout: 180000 },
);
const name = `twui-sc-${Date.now()}`,
  dataVolume = `${name}-data`,
  uiVolume = `${name}-ui`,
  pkg = '/var/packages/transmission',
  prefix = '/managed/ui',
  url = 'http://127.0.0.1:19089',
  results = [];
const run = (args, user = 'sc-transmission') => docker(['exec', '--user', user, name, ...args]);
const shell = (code, user = 'sc-transmission') => run(['/bin/sh', '-c', code], user);
const adapter = (args, user = 'sc-transmission') =>
  run(
    [
      '/usr/bin/env',
      'PATH=/tmp/busybox-bin:/usr/local/bin:/usr/bin:/bin',
      '/test-tools/busybox',
      'sh',
      '/repo/release/synocommunity.sh',
      ...args,
    ],
    user,
  );
function start(extra = []) {
  return run(
    [
      '/usr/bin/env',
      '-u',
      'TRANSMISSION_WEB_HOME',
      '-u',
      'CLUTCH_HOME',
      '-u',
      'XDG_DATA_HOME',
      ...extra,
      '/bin/su',
      '-s',
      '/bin/bash',
      '-c',
      `exec env SYNOPKG_PKGNAME=transmission SYNOPKG_DSM_VERSION_MAJOR=7 SYNOPKG_PKGDEST=${pkg}/target SYNOPKG_PKGVAR=${pkg}/var SYNOPKG_PKGTMP=/tmp /bin/bash ${pkg}/scripts/start-stop-status start`,
      'sc-transmission',
    ],
    'root',
  );
}
function stop() {
  return run([
    '/usr/bin/env',
    'SYNOPKG_PKGNAME=transmission',
    'SYNOPKG_DSM_VERSION_MAJOR=7',
    `SYNOPKG_PKGDEST=${pkg}/target`,
    `SYNOPKG_PKGVAR=${pkg}/var`,
    'SYNOPKG_PKGTMP=/tmp',
    '/bin/bash',
    `${pkg}/scripts/start-stop-status`,
    'stop',
  ]);
}
function create() {
  docker([
    'run',
    '--rm',
    '--init',
    '-d',
    '--name',
    name,
    '-p',
    '127.0.0.1:19089:9091',
    '-v',
    `${root}:/repo:ro,z`,
    '-v',
    `${dataVolume}:${pkg}/var`,
    '-v',
    `${uiVolume}:/managed`,
    '--entrypoint',
    '/bin/sh',
    'twui-lab/synocommunity:4.1.4-32',
    '-c',
    'exec sleep infinity',
  ]);
  run(['/bin/sh', '/repo/lab/synocommunity-setup.sh'], 'root');
}
async function web(expected) {
  const path = expected === 'vendor-ui-preserved' ? '' : 'deployment-version.txt';
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(`${url}/transmission/web/${path}`, { cache: 'no-store' });
      if (response.status === 200 && (await response.text()).trim() === expected) return;
    } catch {
      /* startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected Web UI marker: ${expected}`);
}
const vendorHashes = () =>
  shell(
    `sha256sum ${pkg}/scripts/start-stop-status ${pkg}/scripts/service-setup /usr/local/share/transmission/public_html/index.html`,
  );
try {
  create();
  start();
  await web('vendor-ui-preserved');
  const original = vendorHashes();
  const inspection = adapter(['--inspect']);
  assert.match(inspection, /4\.1\.4-32/);
  assert.match(inspection, /Linux simulation/);
  assert.match(inspection, new RegExp(`Effective XDG data home: ${pkg}/var/.local/share`));
  assert.equal(vendorHashes(), original);
  results.push(
    'BusyBox read-only inspection identifies actual service UID, binary, configuration and effective home',
  );
  const actualPid = shell(`cat ${pkg}/var/transmission.pid`);
  shell(`printf '1\\n' > ${pkg}/var/transmission.pid`);
  assert.throws(() => adapter(['--inspect']));
  run([
    '/bin/sh',
    '-c',
    'printf "%s" "$1" > /var/packages/transmission/var/transmission.pid',
    'sh',
    actualPid,
  ]);
  // Include every precompiled resource; version markers make current/rollback observable.
  shell(
    `for version in 2.0.0-sc-a 2.0.0-sc-b; do mkdir -p /managed/stage-$version; cp -R /repo/dist /managed/stage-$version/web; find /managed/stage-$version/web -name '*.map' -type f -delete; printf '%s\\n' "$version" > /managed/stage-$version/VERSION; printf '%s\\n' "$version" > /managed/stage-$version/web/deployment-version.txt; (cd /managed/stage-$version && find web -type f -exec sha256sum {} \\; > SHA256SUMS && sha256sum VERSION >> SHA256SUMS && tar -czf /managed/$version.tgz VERSION SHA256SUMS web); done`,
  );
  run([
    '/bin/sh',
    '/repo/release/install.sh',
    '--prefix',
    prefix,
    '--archive',
    '/managed/2.0.0-sc-a.tgz',
  ]);
  assert.throws(() => adapter(['--attach', '--prefix', prefix], 'root'));
  shell(
    `mkdir -p ${pkg}/var/.local/share/transmission/public_html; printf 'keep' > ${pkg}/var/.local/share/transmission/public_html/existing`,
  );
  assert.throws(() => adapter(['--attach', '--prefix', prefix]));
  assert.equal(shell(`cat ${pkg}/var/.local/share/transmission/public_html/existing`), 'keep');
  shell(
    `rm ${pkg}/var/.local/share/transmission/public_html/existing; rmdir ${pkg}/var/.local/share/transmission/public_html`,
  );
  adapter(['--attach', '--prefix', prefix]);
  adapter(['--attach', '--prefix', prefix]);
  stop();
  start();
  await web('2.0.0-sc-a');
  const entry = await (await fetch(`${url}/transmission/web/`)).text();
  assert.match(entry, /id="app"/);
  const asset = entry.match(/src="([^"]+\.js)"/)[1],
    bytes = Buffer.from(
      await (await fetch(new URL(asset, `${url}/transmission/web/`))).arrayBuffer(),
    );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    createHash('sha256')
      .update(await readFile(`dist/${asset.replace(/^\.\//, '')}`))
      .digest('hex'),
  );
  assert.equal(vendorHashes(), original);
  results.push(
    'attachment is idempotent, requires real service account and refuses an existing unmanaged XDG UI',
  );
  run([
    '/bin/sh',
    '/repo/release/install.sh',
    '--prefix',
    prefix,
    '--archive',
    '/managed/2.0.0-sc-b.tgz',
  ]);
  await web('2.0.0-sc-b');
  run(['/bin/sh', '/repo/release/install.sh', '--prefix', prefix, '--rollback', '2.0.0-sc-a']);
  await web('2.0.0-sc-a');
  assert.throws(() =>
    run(['/bin/sh', '/repo/release/install.sh', '--prefix', prefix, '--uninstall']),
  );
  results.push(
    'running 4.1.4 daemon follows upgrade/rollback; attached installation refuses premature uninstall',
  );
  stop();
  docker(['rm', '-f', name]);
  create();
  start();
  await web('2.0.0-sc-a');
  assert.equal(vendorHashes(), original);
  results.push(
    'fresh Linux container and reinstalled upstream scripts retain binding through persistent package-data/UI volumes',
  );
  // Unsupported package version and an overriding environment must never silently attach.
  shell(`sed -i 's/4.1.4-32/4.1.4-33/' ${pkg}/INFO`, 'root');
  assert.throws(() => adapter(['--attach', '--prefix', prefix]));
  shell(`sed -i 's/4.1.4-33/4.1.4-32/' ${pkg}/INFO`, 'root');
  stop();
  start(['CLUTCH_HOME=/usr/local/share/transmission/public_html']);
  assert.throws(() => adapter(['--attach', '--prefix', prefix]));
  stop();
  start(['XDG_DATA_HOME=/tmp/twui-sc-unsafe-home']);
  assert.throws(() => adapter(['--attach', '--prefix', prefix]));
  shell('test ! -e /tmp/twui-sc-unsafe-home');
  stop();
  start([`XDG_DATA_HOME=${pkg}/var/multiline-home\nsecond-line`]);
  assert.throws(() => adapter(['--attach', '--prefix', prefix]));
  shell(`test ! -e ${pkg}/var/multiline-home`);
  stop();
  start();
  const link = `${pkg}/var/.local/share/transmission/public_html`;
  shell(`rm ${link}; ln -s /usr/local/share/transmission/public_html ${link}`);
  assert.throws(() => adapter(['--detach', '--prefix', prefix]));
  assert.equal(shell(`readlink ${link}`).trim(), '/usr/local/share/transmission/public_html');
  shell(`rm ${link}; ln -s ${prefix}/current ${link}`);
  adapter(['--detach', '--prefix', prefix]);
  stop();
  start();
  await web('vendor-ui-preserved');
  run(['/bin/sh', '/repo/release/install.sh', '--prefix', prefix, '--uninstall']);
  assert.equal(vendorHashes(), original);
  results.push(
    'unsupported version/override/external-link edits are refused; explicit detach and restart restore original UI',
  );
  const response = await fetch(`${url}/transmission/rpc`, {
    method: 'POST',
    body: JSON.stringify({ method: 'session-get' }),
  });
  assert.equal(response.status, 409);
  assert.ok(response.headers.get('X-Transmission-Session-Id'));
  results.push('RPC session handshake remains available after restoring original UI');
  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/synocommunity-results.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        target: source.packageVersion,
        sourceCommit: source.commit,
        daemonCommit: 'a6d907d9ea2313143af714d7830feb6c1b60b84c',
        shell: run(['/test-tools/busybox', '--help']).split('\n')[0],
        scope:
          'Linux package-layout simulation using pinned upstream start-stop-status and package setup, with real 4.1.4; not DSM certification',
        results,
      },
      null,
      2,
    ),
  );
  console.log(results);
} finally {
  try {
    stop();
  } catch {
    /* failed startup may have no daemon */
  }
  try {
    docker(['rm', '-f', name]);
  } catch {
    /* already removed */
  }
  for (const volume of [dataVolume, uiVolume]) {
    try {
      docker(['volume', 'rm', volume]);
    } catch {
      /* not created */
    }
  }
}
