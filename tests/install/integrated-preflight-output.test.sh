#!/bin/sh
set -eu
root=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
helpers=$(sed -n '/^fail() {$/,/^}$/p; /^preflight_success() {$/,/^}$/p' "$root/release/installer/main.sh")
passed=$(sh -c 'log() { printf "%s\n" "$*"; }; eval "$1"; preflight_success' sh "$helpers")
for expected in '【预检通过】' '未安装、未切换界面、未重启' 'sudo sh install-transmission-web-ui.sh' '仅去掉 --check' '预检通过不代表安装已完成'; do
  case "$passed" in *"$expected"*) :;; *) printf 'Missing success guidance: %s\n' "$expected" >&2; exit 1;; esac
done
if failed=$(sh -c 'log() { printf "%s\n" "$*"; }; action=check; eval "$1"; fail "RPC认证失败"' sh "$helpers" 2>&1); then
  printf 'Failed preflight returned success\n' >&2; exit 1
fi
for expected in '【预检未通过】' '原因：RPC认证失败' '重新运行 --check'; do
  case "$failed" in *"$expected"*) :;; *) printf 'Missing failure guidance: %s\n' "$expected" >&2; exit 1;; esac
done
printf '%s\n' "$passed"
printf 'Preflight success and failure guidance checks passed.\n'
