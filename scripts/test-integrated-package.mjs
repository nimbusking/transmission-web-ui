import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const root = process.cwd(),
  name = `twui-integrated-package-${Date.now()}`,
  pkg = '/var/packages/transmission',
  prefix = `${pkg}/var/transmission-web-ui`;
const docker = (args) =>
  execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim();
const run = (args) => docker(['exec', name, ...args]);
const shell = (code) => run(['sh', '-c', code]);
const installer = (extra = []) =>
  run([
    'sh',
    '/repo/artifacts/installer-2.0.0-installer.3/install-transmission-web-ui.sh',
    '--mode',
    'package',
    '--yes',
    ...extra,
  ]);
const results = [];
try {
  docker([
    'run',
    '--init',
    '-d',
    '--name',
    name,
    '-v',
    `${root}:/repo:ro,z`,
    '--entrypoint',
    'sh',
    'twui-lab/installer-test:local',
    '-c',
    'exec sleep infinity',
  ]);
  run(['sh', '/repo/lab/synocommunity-setup.sh']);
  const lifecycle = `#!/bin/sh
set -eu
[ "$1" = restart ] && [ "$2" = transmission ] || exit 1
if [ -f /tmp/twui-fail-restart ]; then rm /tmp/twui-fail-restart; exit 1; fi
for action in stop start; do
sudo -H -u sc-transmission -- env -u TRANSMISSION_WEB_HOME -u CLUTCH_HOME -u XDG_DATA_HOME SYNOPKG_PKGNAME=transmission SYNOPKG_DSM_VERSION_MAJOR=7 SYNOPKG_PKGDEST=${pkg}/target SYNOPKG_PKGVAR=${pkg}/var SYNOPKG_PKGTMP=/tmp /bin/bash ${pkg}/scripts/start-stop-status "$action"
done
`;
  await writeFile('artifacts/installer-test-synopkg.sh', lifecycle);
  docker(['cp', 'artifacts/installer-test-synopkg.sh', `${name}:/usr/local/bin/synopkg`]);
  shell('chmod 755 /usr/local/bin/synopkg');
  // Simulate an already customized legacy UI at the actual XDG root.
  const xdg = `${pkg}/var/.local/share/transmission/public_html`;
  shell(
    `mkdir -p ${xdg}; printf 'custom-legacy-ui\\n' > ${xdg}/index.html; printf 'keep-css' > ${xdg}/legacy.css; chown -R sc-transmission:sc-transmission ${pkg}/var/.local`,
  );
  run(['synopkg', 'restart', 'transmission']);
  const vendor = shell(
    `sha256sum ${pkg}/scripts/service-setup ${pkg}/scripts/start-stop-status /usr/local/share/transmission/public_html/index.html`,
  );
  results.push({ case: 'package-existing-custom-ui-install', output: installer() });
  const backupRoot = `${pkg}/var/.twui-backups-transmission-web-ui`;
  const first = run(['cat', `${backupRoot}/latest`]);
  assert.equal(run(['cat', `${backupRoot}/${first}/old-web/legacy.css`]), 'keep-css');
  assert.equal(run(['readlink', xdg]), `${prefix}/current`);
  results.push({
    case: 'package-restore-custom-ui',
    output: run([
      'sh',
      '/repo/artifacts/installer-2.0.0-installer.3/install-transmission-web-ui.sh',
      '--restore',
      `${backupRoot}/${first}`,
      '--yes',
    ]),
  });
  assert.equal(run(['cat', `${xdg}/index.html`]), 'custom-legacy-ui');
  assert.equal(run(['cat', `${xdg}/legacy.css`]), 'keep-css');
  shell('touch /tmp/twui-fail-restart');
  let error;
  try {
    installer();
  } catch (e) {
    error = e;
  }
  assert(error, 'Expected injected lifecycle failure');
  assert.match(error.stdout, /已恢复原界面/);
  results.push({
    case: 'package-restart-failure-auto-rollback',
    output: error.stdout,
    stderr: error.stderr,
  });
  assert.equal(run(['cat', `${xdg}/index.html`]), 'custom-legacy-ui');
  assert.equal(
    shell(
      `sha256sum ${pkg}/scripts/service-setup ${pkg}/scripts/start-stop-status /usr/local/share/transmission/public_html/index.html`,
    ),
    vendor,
  );
  // Exercise real daemon authentication through a pseudo-terminal; secrets must not echo.
  const service = (action) =>
    run([
      'sudo',
      '-H',
      '-u',
      'sc-transmission',
      '--',
      'env',
      '-u',
      'TRANSMISSION_WEB_HOME',
      '-u',
      'CLUTCH_HOME',
      '-u',
      'XDG_DATA_HOME',
      'SYNOPKG_PKGNAME=transmission',
      'SYNOPKG_DSM_VERSION_MAJOR=7',
      `SYNOPKG_PKGDEST=${pkg}/target`,
      `SYNOPKG_PKGVAR=${pkg}/var`,
      'SYNOPKG_PKGTMP=/tmp',
      '/bin/bash',
      `${pkg}/scripts/start-stop-status`,
      action,
    ]);
  service('stop');
  run([
    'python3',
    '-c',
    `import json
p='${pkg}/var/settings.json'
with open(p) as f: s=json.load(f)
s.update({'rpc-authentication-required':True,'rpc-username':'installer-test','rpc-password':'test-secret-quote"-slash\\\\-end'})
with open(p,'w') as f: json.dump(s,f)
`,
  ]);
  service('start');
  const authOutput = execFileSync(
    'python3',
    [
      '-c',
      `
import os,pty,select,time,sys
pid,fd=pty.fork()
if pid==0:
 os.execvp('docker',['docker','exec','-it',sys.argv[1],'sh','/repo/artifacts/installer-2.0.0-installer.3/install-transmission-web-ui.sh','--mode','package','--check'])
data=b''; user=False; password=False; deadline=time.time()+60
while time.time()<deadline:
 ready,_,_=select.select([fd],[],[],1)
 if ready:
  try: chunk=os.read(fd,65536)
  except OSError: break
  if not chunk: break
  data+=chunk
  if not user and 'Transmission用户名：'.encode() in data:
   os.write(fd,b'installer-test\\n');user=True
  if not password and 'Transmission密码（不回显）：'.encode() in data:
   time.sleep(.1);os.write(fd,b'test-secret-quote"-slash\\\\-end\\n');password=True
else:
 os.kill(pid,9);raise RuntimeError('authentication timeout')
_,status=os.waitpid(pid,0)
assert os.waitstatus_to_exitcode(status)==0,data.decode(errors='replace')
assert password and b'test-secret' not in data
print(data.decode())
`,
      name,
    ],
    { encoding: 'utf8', timeout: 70000 },
  );
  assert.match(authOutput, /只读预检完成/);
  results.push({
    case: 'authenticated-preflight-hidden-special-character-password',
    output: authOutput,
  });
  console.log(
    'Package single-entry installation, full legacy UI preservation, explicit restore and restart-failure rollback passed (Linux simulation).',
  );
} finally {
  await writeFile(
    'artifacts/integrated-package-recheck-results.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope:
          'Linux simulation using real 4.1.4, actual service account and pinned upstream lifecycle; synopkg CLI is a fixture, not DSM certification',
        results,
      },
      null,
      2,
    ) + '\n',
  );
  docker(['rm', '-f', name]);
}
