#!/bin/sh
# Reproduce DSM's service-account probe from an administrator-only working directory.
set -eu
repo=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
docker run --rm -i --network none --entrypoint /bin/sh \
  -v "$repo:/repo:ro,z" twui-lab/synocommunity:4.1.4-32 -s <<'TEST'
set -eu
mkdir -p /private-admin /tmp/cwd-web
chmod 700 /private-admin
printf '<html>fixture</html>\n' > /tmp/cwd-web/index.html
printf '{}\n' > /tmp/cwd-web/app-config.json
# Negative control: the old probe must fail for the reported reason.
sed '/^  cd \/ || fail /d' /repo/release/synology-check.sh > /tmp/old-probe.sh
cd /private-admin
probe() {
  /bin/su -s /bin/sh nobody -c "PATH=/usr/bin:/bin /bin/sh $1 --mode package --web-home /tmp/cwd-web --service-user nobody --probe-as-service"
}
if probe /tmp/old-probe.sh > /tmp/old-result 2>&1; then
  cat /tmp/old-result >&2
  echo 'Negative control unexpectedly passed' >&2
  exit 1
fi
grep -E 'Permission denied|Cannot traverse the Web root' /tmp/old-result
probe /repo/release/synology-check.sh
# A readable working directory must not hide genuine resource permission errors.
chmod 600 /tmp/cwd-web/index.html
if probe /repo/release/synology-check.sh > /tmp/unreadable-result 2>&1; then
  echo 'Unreadable resource unexpectedly passed' >&2
  exit 1
fi
grep 'Web root is missing or unreadable' /tmp/unreadable-result
echo 'Service cwd regression passed: old failure reproduced, fixed probe passed, unreadable resources rejected.'
TEST
