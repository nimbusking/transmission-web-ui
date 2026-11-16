#!/bin/sh
set -eu
root=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
# Exercise the actual integrated installer's validator without executing its installer.
validator=$(sed -n '/^safe_path() {$/,/^}$/p' "$root/release/installer/main.sh")
[ -n "$validator" ]
check() {
  sh -c 'fail() { exit 1; }; eval "$1"; safe_path "$2"' sh "$validator" "$1"
}
for value in \
  /volume1/@apphome/transmission/.local/share/transmission/public_html \
  /volume1/@appdata/transmission/transmission-web-ui \
  /var/packages/transmission/var/transmission-web-ui \
  /volume1/docker/transmission/web-ui; do
  check "$value" || { printf 'Valid NAS path rejected: %s\n' "$value" >&2; exit 1; }
done
for value in / /usr /var /etc /opt /tmp /root /home relative \
  /volume1/../etc /volume1/./data /volume1/data/.. /volume1/data/. \
  /volume1//data /volume1/data/ '/volume1/path with space' \
  '/volume1/data;touch-x' '/volume1/$(touch-x)' '/volume1/*'; do
  if check "$value"; then printf 'Unsafe path accepted: %s\n' "$value" >&2; exit 1; fi
done
printf 'Integrated NAS paths: valid @ paths accepted; unsafe paths rejected.\n'
