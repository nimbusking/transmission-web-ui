#!/bin/sh
# Standalone installer: no Node.js, Python, jq, daemon restart or package mutation.
set -eu
umask 022
fail() { printf '%s\n' "Error: $*" >&2; exit 1; }
usage() { printf '%s\n' 'Usage: sh install.sh --prefix /absolute/managed/path [--archive release.tar.gz | --url https://... | --rollback VERSION | --uninstall | --check]'; }
prefix=${TWUI_PREFIX-}; archive=; url=; rollback=; action=install; work=; stage=; links=; locked=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix|--archive|--url|--rollback)
      [ "$#" -ge 2 ] || fail "Missing value: $1"
      case "$1" in --prefix) prefix=$2;; --archive) archive=$2;; --url) url=$2;; --rollback) rollback=$2; action=rollback;; esac
      shift 2;;
    --uninstall) action=uninstall; shift;; --check) action=check; shift;;
    --help|-h) usage; exit 0;; *) usage; fail "Unknown option: $1";;
  esac
done
case "$prefix" in /*) :;; *) fail 'An explicit absolute --prefix is required';; esac
case "$prefix" in *'/../'*|*'/./'*|*/..|*/.|*'//'*) fail 'Prefix must be normalized';; esac
prefix=${prefix%/}
case "$prefix" in ''|/|/usr|/usr/local|/var|/opt|/etc|/home|/root|/tmp|/volume[0-9]*)
  # A volume's children are valid; the volume root itself is not.
  case "$prefix" in /volume[0-9]*/*) :;; *) fail 'Refusing a system or volume root';; esac;;
esac
[ ! -L "$prefix" ] || fail 'Prefix itself must not be a symlink'
for utility in tar sha256sum awk sed grep sort uniq find chmod mkdir mktemp rm cp mv ln readlink cat rmdir; do
  command -v "$utility" >/dev/null 2>&1 || fail "Required system utility missing: $utility"
done
cleanup() { [ -z "$links" ] || rm -rf "$links"; [ -z "$stage" ] || rm -rf "$stage"; [ -z "$work" ] || rm -rf "$work"; if [ "$locked" = 1 ]; then rmdir "$prefix/.install-lock" 2>/dev/null || :; fi; }
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
work=$(mktemp -d "${TMPDIR:-/tmp}/twui-install.XXXXXXXX")
mkdir "$work/probe-old" "$work/probe-new" "$work/probe-parent" "$work/probe-switch"
ln -s ../probe-old "$work/probe-parent/current"
ln -s ../probe-new "$work/probe-switch/current"
mv -f "$work/probe-switch/current" "$work/probe-parent/" || fail 'mv cannot replace a managed symlink'
[ "$(readlink "$work/probe-parent/current")" = ../probe-new ] || fail 'mv followed a directory symlink instead of replacing it'
printf 'probe\n' > "$work/probe"
(cd "$work" && sha256sum probe > probe.sums && sha256sum -c probe.sums >/dev/null) || fail 'sha256sum -c is required'
if [ "$action" = check ]; then printf '%s\n' 'System tools supported. Service-account permissions and DSM ACL still require verification.'; exit 0; fi
if [ -e "$prefix" ]; then
  [ -d "$prefix" ] && [ -f "$prefix/.twui-managed" ] && [ ! -L "$prefix/.twui-managed" ] || fail 'Existing prefix is not managed by this installer'
  [ "$(cat "$prefix/.twui-managed")" = transmission-web-ui-v1 ] || fail 'Invalid management marker'
else
  [ "$action" = install ] || fail 'No managed installation exists'
  mkdir -p "$prefix"
  printf 'transmission-web-ui-v1\n' > "$prefix/.twui-managed"
fi
mkdir "$prefix/.install-lock" 2>/dev/null || fail 'Another installer is active; inspect .install-lock before retrying'
locked=1
[ ! -L "$prefix/releases" ] || fail 'Releases directory must not be a symlink'
mkdir -p "$prefix/releases"
valid_version() { printf '%s\n' "$1" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$'; }
validate_link() {
  [ ! -e "$prefix/$1" ] && [ ! -L "$prefix/$1" ] && return 0
  [ -L "$prefix/$1" ] || fail "Refusing non-symlink $1"
  link=$(readlink "$prefix/$1")
  case "$link" in releases/*/web) version=${link#releases/}; version=${version%/web}; valid_version "$version" || fail "Invalid $1 target";; *) fail "Unmanaged $1 target";; esac
}
validate_link current; validate_link previous
switch_to() {
  selected=$1
  [ ! -L "$prefix/releases/$selected" ] && [ ! -L "$prefix/releases/$selected/web" ] || fail 'Release paths must not be symlinks'
  [ -d "$prefix/releases/$selected/web" ] && [ -f "$prefix/releases/$selected/.twui-release" ] || fail 'Release not installed'
  links=$(mktemp -d "$prefix/.switch.XXXXXXXX")
  old=$(readlink "$prefix/current" 2>/dev/null || :)
  if [ -n "$old" ] && [ "$old" != "releases/$selected/web" ]; then
    ln -s "$old" "$links/previous"; mv -f "$links/previous" "$prefix/"
  fi
  ln -s "releases/$selected/web" "$links/current"; mv -f "$links/current" "$prefix/"
  printf '%s\n' "Active release: $selected" "Set TRANSMISSION_WEB_HOME=$prefix/current in the existing service configuration."
}
if [ "$action" = rollback ]; then valid_version "$rollback" || fail 'Invalid rollback version'; switch_to "$rollback"; exit 0; fi
if [ "$action" = uninstall ]; then
  [ ! -e "$prefix/.synocommunity-xdg" ] && [ ! -L "$prefix/.synocommunity-xdg" ] || fail 'Detach the registered SynoCommunity XDG link before uninstalling'
  for directory in "$prefix"/releases/*; do
    [ -e "$directory" ] || continue
    [ ! -L "$directory" ] && [ -f "$directory/.twui-release" ] || fail 'Unmanaged entry in releases; refusing uninstall'
    valid_version "${directory##*/}" || fail 'Unexpected release directory'
  done
  rm -f "$prefix/current" "$prefix/previous"
  for directory in "$prefix"/releases/*; do [ ! -e "$directory" ] || rm -rf "$directory"; done
  printf '%s\n' 'Managed releases removed. Service configuration and original UI were left untouched.'; exit 0
fi
if [ -n "$url" ]; then
  [ -z "$archive" ] || fail 'Choose either --archive or --url'
  case "$url" in https://*) :;; *) fail 'Download URL must use HTTPS';; esac
  archive=$work/release.tar.gz
  if command -v curl >/dev/null 2>&1; then curl --fail --location --proto '=https' --proto-redir '=https' --output "$archive" "$url"
  elif command -v wget >/dev/null 2>&1; then wget -O "$archive" "$url"
  else fail 'Online installation needs curl or wget; use --archive for offline installation'; fi
fi
[ -n "$archive" ] && [ -f "$archive" ] || fail 'Provide a readable release archive'
tar -tzf "$archive" > "$work/entries" || fail 'Cannot list archive'
[ -s "$work/entries" ] || fail 'Empty archive'
awk '
  /[^A-Za-z0-9_.\/-]/ || /^\// || /(^|\/)\.\.?($|\/)/ { exit 1 }
  !/^(web(\/.*)?|docs(\/((deployment|migration|synology)\.md)?)?|LICENSE|VERSION|manifest.json|SHA256SUMS|install.sh|synology-check.sh|synocommunity.sh)$/ { exit 1 }
' "$work/entries" || fail 'Unsafe or unexpected archive path'
sed 's:/$::' "$work/entries" | sort | uniq -d > "$work/duplicates"
[ ! -s "$work/duplicates" ] || fail 'Duplicate archive path'
tar -tvzf "$archive" > "$work/verbose" || fail 'Cannot inspect archive'
awk 'substr($0,1,1)!="-" && substr($0,1,1)!="d" { exit 1 }' "$work/verbose" || fail 'Links and special files are not permitted'
mkdir "$work/unpacked"
tar -xzf "$archive" -C "$work/unpacked" || fail 'Cannot extract archive'
[ -f "$work/unpacked/SHA256SUMS" ] && [ -f "$work/unpacked/VERSION" ] && [ -f "$work/unpacked/web/index.html" ] || fail 'Release metadata or entry is missing'
awk 'length($1)!=64 || $1 ~ /[^0-9a-f]/ || NF!=2 || $2 ~ /(^\/|(^|\/)\.\.?($|\/)|[^A-Za-z0-9_.\/-])/ { exit 1 }' "$work/unpacked/SHA256SUMS" || fail 'Invalid checksum manifest'
(cd "$work/unpacked" && sha256sum -c SHA256SUMS) || fail 'Release checksum mismatch'
(cd "$work/unpacked" && find . -type f | sed 's:^./::' | grep -v '^SHA256SUMS$' | sort) > "$work/files"
awk '{print $2}' "$work/unpacked/SHA256SUMS" | sort > "$work/checksummed"
[ "$(cat "$work/files")" = "$(cat "$work/checksummed")" ] || fail 'Release contains unchecked files'
version=$(cat "$work/unpacked/VERSION"); valid_version "$version" || fail 'Invalid release version'
[ ! -e "$prefix/releases/$version" ] && [ ! -L "$prefix/releases/$version" ] || fail 'Version already installed; use --rollback to activate it'
# Stage on the destination filesystem, then rename and switch. Failed staging never changes current.
stage=$prefix/.stage-$$
mkdir "$stage"
if ! cp -R "$work/unpacked/." "$stage/"; then rm -rf "$stage"; fail 'Cannot stage release'; fi
find "$stage" -type d -exec chmod 755 {} \;
find "$stage" -type f -exec chmod 644 {} \;
printf 'transmission-web-ui-v1\n' > "$stage/.twui-release"
mv "$stage" "$prefix/releases/$version"
switch_to "$version"
