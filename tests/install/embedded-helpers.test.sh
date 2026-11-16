#!/bin/sh
# A standalone repair and the integrated installer must see identical config bytes.
set -eu
repo=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/twui-embedded-test.XXXXXXXX")
trap 'rm -rf "$work"' EXIT
sed '/^# This file is embedded after extract_helpers()/,$d' "$repo/release/install-transmission-web-ui.sh" > "$work/extract.sh"
export work
sh -c '. "$work/extract.sh"; extract_helpers'
for file in install.sh synology-check.sh synocommunity.sh installer/json-paths.awk installer/login-entry.sh login-nginx.conf; do
  cmp "$repo/release/$file" "$work/${file##*/}"
done
printf '%s\n' 'Embedded helpers match their source bytes, including trailing newlines.'
