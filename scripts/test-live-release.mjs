import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, cp, writeFile, readFile, readdir, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd(),
  work = await mkdtemp(path.join(root, '.lab/live-release-')),
  prefix = path.join(work, 'ui');
await chmod(work, 0o755);
const container = `twui-live-${Date.now()}`,
  versions = ['2.0.0-live-a', '2.0.0-live-b'];
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8' });
const install = (args) =>
  execFileSync('sh', ['release/install.sh', '--prefix', prefix, ...args], { encoding: 'utf8' });
const results = [];
async function files(directory, base = '') {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = base ? `${base}/${item.name}` : item.name;
    if (item.isDirectory())
      result.push(...(await files(path.join(directory, item.name), relative)));
    else result.push(relative);
  }
  return result.sort();
}
try {
  for (const version of versions) {
    const stage = path.join(work, version);
    await mkdir(stage);
    await cp('dist', path.join(stage, 'web'), {
      recursive: true,
      filter: (source) => !source.endsWith('.map'),
    });
    await writeFile(path.join(stage, 'web/deployment-version.txt'), version);
    await writeFile(path.join(stage, 'VERSION'), version + '\n');
    const sums = await Promise.all(
      (await files(stage)).map(
        async (file) =>
          `${createHash('sha256')
            .update(await readFile(path.join(stage, file)))
            .digest('hex')}  ${file}`,
      ),
    );
    await writeFile(path.join(stage, 'SHA256SUMS'), sums.join('\n') + '\n');
    execFileSync('tar', [
      '-czf',
      path.join(work, `${version}.tgz`),
      '-C',
      stage,
      'VERSION',
      'SHA256SUMS',
      'web',
    ]);
  }
  install(['--archive', path.join(work, `${versions[0]}.tgz`)]);
  docker([
    'run',
    '--rm',
    '-d',
    '--name',
    container,
    '--user',
    '12345:12345',
    '--tmpfs',
    '/config:uid=12345,gid=12345,mode=755',
    '--tmpfs',
    '/data:uid=12345,gid=12345,mode=755',
    '-e',
    'TRANSMISSION_WEB_HOME=/webui/current',
    '-v',
    `${prefix}:/webui:ro,z`,
    '-p',
    '127.0.0.1:19099:9091',
    'twui-lab/transmission:4.0.6',
  ]);
  const marker = async () => {
    const response = await fetch('http://127.0.0.1:19099/transmission/web/deployment-version.txt', {
      cache: 'no-store',
    });
    assert.equal(response.status, 200);
    return response.text();
  };
  for (let i = 0; i < 50; i++) {
    try {
      if ((await marker()) === versions[0]) break;
    } catch {
      /* startup only */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(await marker(), versions[0]);
  results.push('initial non-root daemon loads release A');
  install(['--archive', path.join(work, `${versions[1]}.tgz`)]);
  assert.equal(await marker(), versions[1]);
  results.push('running daemon sees release B without restart');
  install(['--rollback', versions[0]]);
  assert.equal(await marker(), versions[0]);
  results.push('running daemon sees rollback A without restart');
  const rpc = await fetch('http://127.0.0.1:19099/transmission/rpc', {
    method: 'POST',
    body: JSON.stringify({ method: 'session-get' }),
  });
  assert.equal(rpc.status, 409);
  assert.ok(rpc.headers.get('X-Transmission-Session-Id'));
  results.push('same-origin RPC handshake remains available');
  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/live-release-results.json',
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );
  console.log(results);
} finally {
  try {
    docker(['rm', '-f', container]);
  } catch {
    /* not yet created */
  }
  await rm(work, { recursive: true, force: true });
}
