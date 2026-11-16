#!/bin/sh
# DSM package entry repair. Run interactively with sudo; no stored credentials.
set -eu
PATH=/usr/syno/bin:/usr/syno/sbin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH
umask 077
fail() { printf '错误：%s\n' "$*" >&2; exit 1; }
root=/usr/local/share/transmission-web-ui-login
conf=/etc/nginx/conf.d/http.transmission-web-ui-login.conf
settings=/var/packages/transmission/var/settings.json
source=$(CDPATH='' cd -- "$(dirname "$0")" && pwd)
[ "$(id -u)" = 0 ] || fail '请通过 sudo sh 运行。'
for tool in synopkg nginx curl netstat sha256sum sed awk cp cmp find; do command -v "$tool" >/dev/null || fail "缺少 $tool"; done
port() { sed -n 's/^[[:space:]]*"rpc-port"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$settings"; }
set_port() {
    [ "$(port)" = "$1" ] || fail 'RPC 端口已变化，保留现场。'
    sed "s/\(\"rpc-port\"[[:space:]]*:[[:space:]]*\)$1\([[:space:]]*[,}]*[[:space:]]*\)$/\1$2\2/" "$settings" > "$root/settings.next"
    cat "$root/settings.next" > "$settings"
    rm "$root/settings.next"
    [ "$(port)" = "$2" ] || fail '修改 RPC 端口失败。'
}
http_code() { curl -s --connect-timeout 2 --max-time 3 -o /dev/null -w '%{http_code}' "$1" || :; }
wait_code() {
    n=0
    while [ "$n" -lt 30 ]; do
        [ "$(http_code "$1")" = "$2" ] && return 0
        sleep 1; n=$((n + 1))
    done
    return 1
}
restore() {
    printf '%s\n' '正在恢复 Transmission 的 9091 入口……'
    if [ -e "$conf" ]; then
        cmp -s "$conf" "$root/nginx.conf" || return 1
        rm "$conf" || return 1
        nginx -t && nginx -s reload || return 1
        sleep 2
    fi
    synopkg stop transmission >/dev/null || return 1
    case "$(port)" in 9093) set_port 9093 9091;; 9091) :;; *) return 1;; esac
    synopkg start transmission >/dev/null || return 1
    wait_code http://127.0.0.1:9091/transmission/web/ 401 || return 1
    printf '%s\n' '已恢复原认证入口；备份和新静态文件保留。'
}
if [ "${1-}" = --restore ]; then
    [ -f "$root/.managed" ] && [ ! -L "$root" ] || fail '没有受管理的登录入口。'
    restore || fail '恢复未完成，请保留现场和备份。'
    exit 0
fi
[ "$#" = 0 ] || fail '仅支持无参数安装或 --restore。'
[ ! -e "$root" ] && [ ! -L "$root" ] || fail "目录已存在：$root；不覆盖已有部署。"
[ ! -e "$conf" ] && [ ! -L "$conf" ] || fail '已有同名 nginx 配置，不覆盖。'
grep -Fq 'include conf.d/http.*.conf;' /etc/nginx/nginx.conf || fail '此 DSM nginx 没有已验证的配置入口。'
[ "$(port)" = 9091 ] || fail '此修复针对当前 RPC 端口为 9091 的套件。'
grep -q '^version="4.1.4-32"' /var/packages/transmission/INFO || fail '套件版本不匹配。'
grep -q '^maintainer="SynoCommunity"' /var/packages/transmission/INFO || fail '套件来源不匹配。'
[ "$(http_code http://127.0.0.1:9091/transmission/web/)" = 401 ] || fail '原入口未返回预期的认证响应。'
if netstat -lnt | awk '$4 ~ /:9093$/ {found=1} END {exit !found}'; then fail '9093 已被占用。'; fi
(cd "$source" && sha256sum -c SHA256SUMS >/dev/null) || fail '修复包摘要不一致。'
nginx -t || fail '原 nginx 配置检查失败。'
printf '%s\n' '将保留网页地址 9091，由 nginx 提供登录页；Transmission RPC 改为 9093，密码认证继续保留。' '会短暂停止传输并重载 nginx。继续？[y/N]'
IFS= read -r answer
case "$answer" in y|Y) :;; *) exit 0;; esac
mkdir -m 755 "$root"
printf 'twui-login-v1\n' > "$root/.managed"
cp -R "$source/web" "$root/web"
find "$root/web" -type d -exec chmod 755 {} \;
find "$root/web" -type f -exec chmod 644 {} \;
cp "$source/login-nginx.conf" "$root/nginx.conf"
cp "$source/install-login-entry.sh" "$root/install-login-entry.sh"
mkdir -m 700 "$root/backup"
changed=0
cleanup() {
    code=$?
    trap - EXIT INT TERM HUP
    if [ "$changed" = 1 ]; then
        restore || printf '恢复未完成。执行：sudo sh %s/install-login-entry.sh --restore\n' "$root" >&2
    fi
    exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
# Validate the added server before touching Transmission; nginx -t does not bind ports.
cp "$root/nginx.conf" "$conf"
if ! nginx -t; then rm "$conf"; fail '新增配置不兼容，未改变 Transmission。'; fi
changed=1
printf '%s\n' '正在停止套件并保存停止后的配置……'
synopkg stop transmission >/dev/null
cp -p "$settings" "$root/backup/settings.json"
set_port 9091 9093
printf '%s\n' '正在启动 Transmission RPC……'
synopkg start transmission >/dev/null
wait_code http://127.0.0.1:9093/transmission/web/ 401 || fail '新 RPC 端口未恢复认证服务。'
nginx -s reload
wait_code http://127.0.0.1:9091/transmission/web/ 200 || fail '新登录页入口未就绪。'
headers=$root/rpc-headers
code=$(curl -sS --max-time 5 -D "$headers" -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:9091/transmission/rpc)
[ "$code" = 401 ] || fail 'RPC 未拒绝未认证请求。'
if grep -qi '^WWW-Authenticate:' "$headers"; then fail 'RPC 仍触发浏览器原生认证。'; fi
rm "$headers"
changed=0
printf '%s\n' '登录入口修复完成。仍使用原来的 http://群晖IP:9091/transmission/web/，在页面内输入原 Transmission 账号密码。' "恢复命令：sudo sh $root/install-login-entry.sh --restore"
