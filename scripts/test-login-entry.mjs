import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
const root = process.cwd();
const name = `twui-login-${Date.now()}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 60000 });
const temp = `${root}/artifacts/${name}`;
await mkdir(temp, { recursive: true });
await writeFile(
  `${temp}/nginx.conf`,
  (await readFile('release/login-nginx.conf', 'utf8'))
    .replace('listen 9091;', 'listen 19101;')
    .replaceAll('127.0.0.1:9093', '127.0.0.1:19103')
    .replace('/usr/local/share/transmission-web-ui-login/web/', '/web/'),
);
try {
  docker(
    'run',
    '-d',
    '--rm',
    '--name',
    `${name}-rpc`,
    '-p',
    '127.0.0.1:19103:9091',
    '-e',
    'TR_USER=lab',
    '-e',
    'TR_PASS=lab-only-password',
    'twui-lab/transmission:4.1.4',
  );
  docker(
    'run',
    '-d',
    '--rm',
    '--name',
    `${name}-web`,
    '--network',
    'host',
    '-v',
    `${temp}/nginx.conf:/etc/nginx/conf.d/default.conf:ro,z`,
    '-v',
    `${root}/dist:/web:ro,z`,
    'nginx:stable-alpine@sha256:901e593c95dc85f5a729f5765516321366ef4ac401821431d408897e95287d0a',
  );
  const base = 'http://127.0.0.1:19101';
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${base}/transmission/rpc`, { method: 'POST' })).status === 401) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the isolated services to start. */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, 'authenticated daemon ready');
  const page = await fetch(`${base}/transmission/web/`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('www-authenticate'), null);
  for (const auth of ['', `Basic ${Buffer.from('lab:wrong').toString('base64')}`]) {
    const response = await fetch(`${base}/transmission/rpc`, {
      method: 'POST',
      headers: { Authorization: auth },
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), null);
  }
  const headers = {
    Authorization: `Basic ${Buffer.from('lab:lab-only-password').toString('base64')}`,
  };
  const handshake = await fetch(`${base}/transmission/rpc`, { method: 'POST', headers });
  assert.equal(handshake.status, 409);
  headers['X-Transmission-Session-Id'] = handshake.headers.get('x-transmission-session-id');
  assert.ok(headers['X-Transmission-Session-Id']);
  const rpc = await fetch(`${base}/transmission/rpc`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ method: 'session-get' }),
  });
  assert.equal((await rpc.json()).result, 'success');
  assert.equal((await fetch(`${base}/settings.json`)).status, 404);
  docker(
    'run',
    '--rm',
    '--network',
    'host',
    '--ipc',
    'host',
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '-e',
    'npm_config_cache=/tmp/twui-cache',
    '-v',
    `${root}:${root}:z`,
    '-w',
    root,
    'mcr.microsoft.com/playwright:v1.65.1-noble',
    'npx',
    'playwright',
    'test',
    '--config=playwright.login-entry.config.ts',
  );
  console.log(
    'Login gateway verified against real Transmission 4.1.4: public HTML, protected RPC, challenge suppressed, session handshake and browser login.',
  );
} finally {
  for (const suffix of ['web', 'rpc']) {
    try {
      docker('rm', '-f', `${name}-${suffix}`);
    } catch {
      /* Already stopped or never created. */
    }
  }
  await rm(temp, { recursive: true, force: true });
}
