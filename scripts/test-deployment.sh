#!/bin/sh
# Host-side harness; Docker is for validation only, not a release runtime dependency.
set -eu
repo=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
image=busybox:1.37.0@sha256:a7dbc319b1438115a207e11930dc4bb3e643dcb3ec0bdd694bb36cd8fad289ec
work=$(mktemp -d "$repo/.lab/deploy.XXXXXXXX")
chmod 755 "$work"
trap 'rm -rf "$work"' EXIT
# Installer executes with BusyBox alone and no network.
docker run --rm --network none -v "$repo:/repo:ro,z" "$image" sh -c 'if command -v node || command -v python3; then exit 1; fi; sh /repo/tests/install/installer.test.sh && sh -n /repo/release/synocommunity.sh && sh /repo/release/synocommunity.sh --help'
docker run --rm --network none --user "$(id -u):$(id -g)" -v "$repo/artifacts:/artifacts:ro,z" -v "$repo/release:/release:ro,z" -v "$work:/target:z" "$image" sh /release/install.sh --prefix /target/ui --archive /artifacts/transmission-web-ui-2.0.0.tar.gz
# Mount the parent as read-only; an unrelated non-root UID must resolve current.
docker run --rm --network none --user 12345:12345 -v "$work/ui:/web-ui:ro,z" "$image" sh -c 'test -r /web-ui/current/index.html; test "$(readlink /web-ui/current)" = releases/2.0.0/web; test ! -w /web-ui/current/index.html'
docker run --rm --network none --user "$(id -u):$(id -g)" -v "$work/ui:/web-ui:ro,z" -v "$repo/release:/release:ro,z" "$image" sh /release/synology-check.sh --mode package --web-home /web-ui/current
# Verify the checker under an actual named non-root account, including traversal denial.
docker run --rm --network none --user nobody -v "$work/ui:/web-ui:ro,z" -v "$repo/release:/release:ro,z" "$image" sh /release/synology-check.sh --mode container --web-home /web-ui/current --service-user nobody --probe-as-service
mkdir "$work/ui/releases/2.0.0/web/private-probe"
chmod 700 "$work/ui/releases/2.0.0/web/private-probe"
if docker run --rm --network none --user nobody -v "$work/ui:/web-ui:ro,z" -v "$repo/release:/release:ro,z" "$image" sh /release/synology-check.sh --mode package --web-home /web-ui/current --service-user nobody --probe-as-service; then
  printf '%s\n' 'Expected traversal-denied service probe to fail' >&2; exit 1
fi
rmdir "$work/ui/releases/2.0.0/web/private-probe"
# Fresh container repeats resolution (container recreation must not pin the old inode).
docker run --rm --network none --user 12345:12345 -v "$work/ui:/web-ui:ro,z" "$image" sh -c 'test -r /web-ui/current/app-config.json'
printf 'Offline BusyBox and non-root parent mount validation passed\n'
