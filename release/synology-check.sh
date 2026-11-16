#!/bin/sh
# Read-only deployment preflight. Run --probe-as-service as the real service account.
set -eu
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
mode=; web=; user=; probe=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --mode|--web-home|--service-user) [ "$#" -ge 2 ] || fail "Missing $1 value"; case "$1" in --mode) mode=$2;; --web-home) web=$2;; --service-user) user=$2;; esac; shift 2;;
    --probe-as-service) probe=1; shift;; *) fail "Unknown option: $1";;
  esac
done
case "$mode" in package|container) :;; *) fail 'Specify --mode package or container';; esac
case "$web" in /*) :;; *) fail 'Specify absolute --web-home';; esac
[ -d "$web" ] && [ -r "$web/index.html" ] && [ -r "$web/app-config.json" ] || fail 'Web root is missing or unreadable; check every parent directory and ACL'
if [ "$probe" = 1 ]; then
  [ -n "$user" ] || fail 'Specify the real --service-user'
  actual=$(id -un)
  [ "$actual" = "$user" ] || fail "Run this probe as $user (currently $actual)"
  # BusyBox find may resolve cwd even for an absolute traversal. The invoking
  # administrator's home can be inaccessible after switching service accounts.
  cd / || fail 'Cannot enter a service-readable working directory'
  files=$(mktemp "${TMPDIR:-/tmp}/twui-read-probe.XXXXXXXX")
  trap 'rm -f "$files"' EXIT
  find -L "$web/" -type f > "$files" || fail 'Cannot traverse the Web root as the service account'
  while IFS= read -r file; do [ -r "$file" ] || fail "Unreadable by service: $file"; done < "$files"
  printf 'Service-account read probe passed: %s\n' "$user"
else
  printf '%s\n' 'Current account can read the entry. Repeat --probe-as-service under the actual service account to validate ACL access.'
fi
if [ -f /etc.defaults/VERSION ]; then printf '%s\n' 'DSM version metadata detected (record it with the validation report).'; else printf '%s\n' 'DSM metadata absent: this is a generic Linux preflight, not DSM certification.'; fi
if [ "$mode" = package ]; then
  printf '%s\n' 'Package mode: use the integration verified for the exact version. SynoCommunity 4.1.4-32 can use synocommunity.sh after real-process inspection; other packages need a supported persistent mechanism.'
  printf '%s\n' 'Do not replace vendor startup scripts. This read probe alone does not certify package integration or DSM lifecycle behavior.'
else
  printf '%s\n' 'Container mode: mount the managed parent directory read-only, set the in-container TRANSMISSION_WEB_HOME, then recreate and verify HTTP/RPC.'
fi
printf 'Web root: %s\n' "$web"
