#!/bin/sh
# SynoCommunity 4.1.4-32: inspect the real daemon, then use its XDG search path.
# Never source package files, alter vendor scripts, or restart the service.
set -eu
umask 022
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
usage() { printf '%s\n' 'Usage: sh synocommunity.sh [--inspect | --attach --prefix /managed/path | --detach --prefix /managed/path] [--package-root /var/packages/transmission]'; }
action=inspect; prefix=; package_root=/var/packages/transmission; locked=0; probe=; staged=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --inspect|--attach|--detach) action=${1#--}; shift;;
    --prefix|--package-root)
      [ "$#" -ge 2 ] || fail "Missing $1 value"
      case "$1" in --prefix) prefix=$2;; --package-root) package_root=$2;; esac
      shift 2;;
    --help|-h) usage; exit 0;; *) fail "Unknown option: $1";;
  esac
done
for utility in awk cat id readlink tr wc sha256sum grep find mkdir rmdir dirname ln rm mv mktemp; do
  command -v "$utility" >/dev/null 2>&1 || fail "Required system utility missing: $utility"
done
cleanup() {
  [ -z "$probe" ] || rm -rf "$probe"
  [ -z "$staged" ] || rm -f "$staged"
  if [ "$locked" = 1 ]; then rmdir "$prefix/.install-lock"; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
normalized() {
  case "$1" in /*) :;; *) fail 'Paths must be absolute';; esac
  case "$1" in /|*'/../'*|*'/./'*|*/..|*/.|*'//'*) fail 'Paths must be normalized and cannot be root';; esac
  if printf '%s' "$1" | LC_ALL=C grep -q '[[:cntrl:]]'; then fail 'Control characters in paths are unsupported'; fi
}
value() {
  awk -v key="$2" 'index($0,key "=")==1 { v=substr($0,length(key)+2); sub(/^"/,"",v); sub(/"$/, "", v); print v; exit }' "$1"
}
future_path() {
  parent=$1; suffix=
  while [ ! -e "$parent" ] && [ ! -L "$parent" ]; do
    suffix=/${parent##*/}$suffix; parent=${parent%/*}; [ -n "$parent" ] || parent=/
  done
  actual=$(readlink -f "$parent") || fail 'Cannot resolve the existing data-directory parent'
  [ -d "$actual" ] || fail 'Data-directory parent is not a directory'
  printf '%s%s\n' "${actual%/}" "$suffix"
}
managed_prefix() {
  normalized "$prefix"
  [ ! -L "$prefix" ] && [ -d "$prefix" ] || fail 'Prefix must be an existing managed directory'
  prefix=$(CDPATH='' cd "$prefix" && pwd -P)
  [ -f "$prefix/.twui-managed" ] && [ ! -L "$prefix/.twui-managed" ] || fail 'Missing management marker'
  [ "$(cat "$prefix/.twui-managed")" = transmission-web-ui-v1 ] || fail 'Unexpected management marker'
  marker=$prefix/.synocommunity-xdg
  if [ -e "$marker" ] || [ -L "$marker" ]; then
    [ -f "$marker" ] && [ ! -L "$marker" ] || fail 'Invalid XDG registration'
    [ "$(awk 'NR==1' "$marker")" = twui-synocommunity-xdg-v1 ] || fail 'Unmanaged XDG registration'
    [ "$(awk 'NR==3' "$marker")" = "$prefix/current" ] || fail 'XDG registration belongs to another prefix'
  fi
  mkdir "$prefix/.install-lock" 2>/dev/null || fail 'Another installer or adapter is active'
  locked=1
}
if [ "$action" = detach ]; then
  managed_prefix
  [ -f "$marker" ] || fail 'No registered XDG link'
  link=$(awk 'NR==2' "$marker"); normalized "$link"
  case "$link" in */transmission/public_html) :;; *) fail 'Invalid registered XDG path';; esac
  if [ -e "$link" ] || [ -L "$link" ]; then
    [ -L "$link" ] && [ "$(readlink "$link")" = "$prefix/current" ] || fail 'XDG entry changed externally; refusing to remove it'
    rm "$link"
  fi
  rm "$marker"
  printf '%s\n' 'Managed XDG link detached. Restart the package through Package Center to reload its original UI.'
  exit 0
fi
normalized "$package_root"
[ -r "$package_root/INFO" ] || fail 'Package INFO is missing or unreadable'
[ "$(value "$package_root/INFO" package)" = transmission ] || fail 'Not a Transmission package'
[ "$(value "$package_root/INFO" maintainer)" = SynoCommunity ] || fail 'Package maintainer is not SynoCommunity'
version=$(value "$package_root/INFO" version)
printf 'Package: SynoCommunity Transmission %s\n' "$version"
if [ -r /etc.defaults/VERSION ]; then
  printf '%s\n' 'DSM metadata detected; record actual ACL, restart and upgrade evidence separately.'
else
  printf '%s\n' 'DSM metadata absent: this is a Linux simulation, not DSM certification.'
fi
for file in service-setup start-stop-status; do
  [ -r "$package_root/scripts/$file" ] || fail "Missing package script: $file"
  sha256sum "$package_root/scripts/$file"
done
[ "$version" = 4.1.4-32 ] || fail 'Automatic XDG attachment is validated only for SynoCommunity 4.1.4-32'
service_user=sc-transmission
service_uid=$(id -u "$service_user") || fail 'Actual sc-transmission account is missing'
if [ "$action" = attach ]; then
  [ "$(id -u)" = "$service_uid" ] || fail 'Run --attach as the actual sc-transmission service account, not root'
fi
pkgvar=$(readlink -f "$package_root/var") || fail 'Cannot resolve package data directory'
[ -d "$pkgvar" ] || fail 'Package data directory is missing'
[ -r "$pkgvar/transmission.pid" ] || fail 'Start the existing package before inspection; PID file is unavailable'
pid=$(cat "$pkgvar/transmission.pid")
case "$pid" in ''|*[!0-9]*) fail 'Invalid daemon PID';; esac
[ "$pid" -gt 1 ] || fail 'Invalid daemon PID'
process=/proc/$pid
uid=$(awk '/^Uid:/ { print $2 }' "$process/status") || fail 'Cannot inspect daemon owner'
[ "$uid" = "$service_uid" ] || fail 'PID does not belong to sc-transmission'
binary=$(readlink -f "$package_root/target/bin/transmission-daemon") || fail 'Cannot resolve package daemon'
running_binary=$(readlink "$process/exe") || fail 'Cannot inspect daemon executable; run as the actual sc-transmission account'
[ "$running_binary" = "$binary" ] || fail 'PID is not the installed package daemon'
epoch=$(awk '{ sub(/^.*\) /, ""); print $20 }' "$process/stat")
[ "$(LC_ALL=C tr -cd '\012' < "$process/environ" | wc -c)" -eq 0 ] || fail 'Multiline daemon environment is unsupported; no automatic attachment'
[ "$(LC_ALL=C tr -cd '\012' < "$process/cmdline" | wc -c)" -eq 0 ] || fail 'Multiline daemon arguments are unsupported; no automatic attachment'
environment=$(tr '\000' '\n' < "$process/environ") || fail 'Cannot read daemon environment; inspect as administrator or service account'
arguments=$(tr '\000' '\n' < "$process/cmdline") || fail 'Cannot read daemon command identity'
config_dir=$(printf '%s\n' "$arguments" | awk 'previous=="--config-dir" { print; exit } { previous=$0 }')
[ -n "$config_dir" ] && [ "$(readlink -f "$config_dir")" = "$pkgvar" ] || fail 'PID does not use this package configuration directory'
env_value() { printf '%s\n' "$environment" | awk -v key="$1" 'index($0,key "=")==1 { print substr($0,length(key)+2); exit }'; }
[ -z "$(env_value CLUTCH_HOME)" ] && [ -z "$(env_value TRANSMISSION_WEB_HOME)" ] || fail 'Daemon already has a Web-root environment override; XDG would not take priority'
data_home=$(env_value XDG_DATA_HOME)
if [ -z "$data_home" ]; then
  daemon_home=$(env_value HOME)
  [ -n "$daemon_home" ] || daemon_home=$(awk -F: -v uid="$service_uid" '$3==uid {print $6; exit}' /etc/passwd)
  normalized "$daemon_home"
  [ -d "$daemon_home" ] || fail 'Actual daemon home is unavailable; no directories have been created'
  data_home=$daemon_home/.local/share
fi
normalized "$data_home"
data_home=$(future_path "$data_home")
case "$data_home/" in
  "$pkgvar/"*) :;;
  *) printf '%s\n' "$data_home" | grep -Eq '^/volume[0-9]+/' || fail 'Effective XDG data home is not in package data or a NAS volume; no automatic attachment';;
esac
[ "$(awk '{ sub(/^.*\) /, ""); print $20 }' "$process/stat")" = "$epoch" ] || fail 'Daemon identity changed during inspection'
link=$data_home/transmission/public_html
printf 'Service user: %s (UID %s)\nEffective XDG data home: %s\nCandidate link: %s\n' "$service_user" "$service_uid" "$data_home" "$link"
if [ "$action" = inspect ]; then
  printf '%s\n' 'Read-only inspection completed. No configuration or filesystem entries were changed.'
  exit 0
fi
managed_prefix
active=$(readlink "$prefix/current") || fail 'Missing current release link'
case "$active" in releases/*/web) :;; *) fail 'Unexpected current release link';; esac
selected=${active#releases/}; selected=${selected%/web}
printf '%s\n' "$selected" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$' || fail 'Invalid active version'
[ ! -L "$prefix/releases/$selected" ] && [ ! -L "$prefix/releases/$selected/web" ] || fail 'Active release paths must not be symlinks'
sh "$(dirname "$0")/synology-check.sh" --mode package --web-home "$prefix/current" --service-user "$service_user" --probe-as-service
case "$prefix/" in "$link/"*) fail 'Prefix cannot be inside the selected XDG Web root';; esac
if [ -f "$marker" ]; then
  [ "$(awk 'NR==2' "$marker")" = "$link" ] || fail 'Effective XDG path changed; detach the previous registration first'
fi
if [ -e "$link" ] || [ -L "$link" ]; then
  [ -f "$marker" ] && [ -L "$link" ] && [ "$(readlink "$link")" = "$prefix/current" ] || fail 'Existing XDG Web UI is unmanaged; refusing to replace it'
  printf '%s\n' 'Managed XDG link is already attached.'
  exit 0
fi
probe=$(mktemp -d "${TMPDIR:-/tmp}/twui-xdg-probe.XXXXXXXX")
ln -sT "$prefix/current" "$probe/link" || fail 'ln -sT is required to avoid following existing directories'
if ln -sT "$prefix/current" "$probe/link" 2>/dev/null; then fail 'ln must refuse an existing link'; fi
mkdir -p "$data_home/transmission"
[ "$(readlink -f "$data_home/transmission")" = "$data_home/transmission" ] || fail 'XDG parent changed; refusing attachment'
staged=$prefix/.synocommunity-xdg.$$
printf '%s\n' twui-synocommunity-xdg-v1 "$link" "$prefix/current" "$version" > "$staged"
mv "$staged" "$marker"; staged=
ln -sT "$prefix/current" "$link" || fail 'Cannot create XDG link; registration retained for explicit detach/retry'
printf '%s\n' 'Managed XDG link attached. Restart Transmission through Package Center, then verify static UI and RPC.' 'Vendor scripts, settings and bundled Web UI were not changed. NAS reboot and package upgrade still require real-device validation.'
