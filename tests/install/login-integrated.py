"""Isolated Linux simulation: actual installer, nginx and Transmission; no NAS mutations."""
import json
import os
import pty
import select
import shutil
import subprocess
import time
from pathlib import Path

os.environ.pop('TRANSMISSION_WEB_HOME', None)
subprocess.run(['sh', '/repo/lab/synocommunity-setup.sh'], check=True)
settings = Path('/var/packages/transmission/var/settings.json')
data = json.loads(settings.read_text())
data.update({'rpc-authentication-required': True, 'rpc-username': 'lab', 'rpc-password': 'lab-only-password'})
settings.write_text(json.dumps(data, indent=4))
Path('/etc.defaults').mkdir(exist_ok=True)
Path('/etc.defaults/VERSION').write_text('DSM simulation only\n')
Path('/usr/local/bin/synopkg').write_text('''#!/bin/sh
if [ "$1" = restart ]; then "$0" stop transmission && exec "$0" start transmission; fi
export SYNOPKG_PKGNAME=transmission SYNOPKG_DSM_VERSION_MAJOR=7
export SYNOPKG_PKGDEST=/var/packages/transmission/target SYNOPKG_PKGVAR=/var/packages/transmission/var SYNOPKG_PKGTMP=/tmp
unset TRANSMISSION_WEB_HOME CLUTCH_HOME XDG_DATA_HOME
exec sudo -E -u sc-transmission env HOME=/var/packages/transmission/var /bin/bash /var/packages/transmission/scripts/start-stop-status "$1"
''')
Path('/usr/local/bin/synopkg').chmod(0o755)
Path('/etc/nginx/nginx.conf').write_text('user www-data;\nevents {}\nhttp { include /etc/nginx/mime.types; include conf.d/http.*.conf; }\n')
subprocess.run(['nginx'], check=True)
subprocess.run(['synopkg', 'start', 'transmission'], check=True)
installer = '/repo/artifacts/installer-2.0.0-installer.5/install-transmission-web-ui.sh'
backups = Path('/var/packages/transmission/var/.twui-backups-transmission-web-ui')

def run(*args, success=True):
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp('sh', ['sh', installer, *args])
    output = b''
    pending = b''
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        if select.select([fd], [], [], 0.2)[0]:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                break
            if not chunk:
                break
            output += chunk
            pending += chunk
            for prompt, answer in [('Transmission用户名：', 'lab\n'), ('Transmission密码（不回显）：', 'lab-only-password\n')]:
                if prompt.encode() in pending:
                    os.write(fd, answer.encode())
                    pending = b''
        ended, status = os.waitpid(pid, os.WNOHANG)
        if ended:
            break
    else:
        os.kill(pid, 9)
        raise AssertionError('installer timed out: ' + output.decode(errors='replace'))
    try:
        _, status = os.waitpid(pid, 0)
    except ChildProcessError:
        pass
    os.close(fd)
    text = output.decode(errors='replace')
    print(text.replace('lab-only-password', '[test password]'))
    assert (os.waitstatus_to_exitcode(status) == 0) == success, text
    return text

def port():
    return json.loads(settings.read_text())['rpc-port']

run('--mode', 'package', '--check')
run('--mode', 'package', '--check', '--login-page', 'off')
assert port() == 9091
assert not Path('/usr/local/share/transmission-web-ui-login').exists()
run('--mode', 'package', '--yes')
assert port() == 9093
first = backups / (backups / 'latest').read_text().strip()
root = Path('/usr/local/share/transmission-web-ui-login')
assert (root / 'web').is_symlink()
first_web = os.readlink(root / 'web')
config = Path('/etc/nginx/conf.d/http.transmission-web-ui-login.conf')
original_config = config.read_text()
config.write_text(original_config + '\n# externally changed\n')
run('--mode', 'package', '--check', success=False)
assert os.readlink(root / 'web') == first_web
config.write_text(original_config)
run('--mode', 'package', '--yes')
second = backups / (backups / 'latest').read_text().strip()
assert os.readlink(root / 'web') != first_web
run('--restore', str(second), '--yes')
assert port() == 9093
assert (root / 'web/index.html').read_bytes() == (second / 'login-old-web/index.html').read_bytes()
run('--restore', str(first), '--yes')
assert port() == 9091
assert not Path('/etc/nginx/conf.d/http.transmission-web-ui-login.conf').exists()
assert not root.exists()
# Fail nginx activation once; the outer installer must roll back both layers.
Path('/tmp/fail-login-reload').touch()
Path('/usr/local/bin/nginx').write_text('''#!/bin/sh
if [ "$1" = -s ] && [ -f /tmp/fail-login-reload ]; then rm /tmp/fail-login-reload; exit 1; fi
exec /usr/sbin/nginx "$@"
''')
Path('/usr/local/bin/nginx').chmod(0o755)
run('--mode', 'package', '--yes', success=False)
assert port() == 9091
assert not Path('/etc/nginx/conf.d/http.transmission-web-ui-login.conf').exists()
assert not (backups / 'pending').exists()
# Convert the managed link into the legacy standalone repair's real web directory.
run('--mode', 'package', '--yes')
shutil.copytree(root / 'web', root / 'legacy-fixture')
(root / 'web').unlink()
(root / 'legacy-fixture').rename(root / 'web')
run('--mode', 'package', '--yes')
legacy = backups / (backups / 'latest').read_text().strip()
assert (root / 'web').is_symlink()
run('--restore', str(legacy), '--yes')
assert port() == 9093
assert (root / 'web/index.html').read_bytes() == (legacy / 'login-old-web/index.html').read_bytes()
print('PASS: fresh install, managed upgrade, upgrade rollback, first-install rollback, injected activation failure, legacy migration and recovery; authenticated RPC and resources verified')
