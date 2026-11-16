# This file is embedded after extract_helpers() in the standalone installer.
set -eu
umask 077
VERSION=1
mode=auto; action=install; archive=; url=; expected=; prefix=; container=; endpoint=; restore=; yes=0; tag=latest; tag_explicit=0
work=; tx=; backup_root=; locked=0; mutating=0; finished=0; terminal_hidden=0; socket=; api=; original_id=; name=; old_link=; original_web=; reuse=0; package_root=/var/packages/transmission
log() { printf '%s\n' "$*"; }
fail() { log "错误：$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "缺少系统工具 $1；未切换界面。"; }
usage() {
  cat <<'HELP'
Transmission Web UI 一体化安装器
  sudo sh install-transmission-web-ui.sh                  自动检测并交互安装
  sudo sh install-transmission-web-ui.sh --archive 包.tar.gz
  sudo sh install-transmission-web-ui.sh --restore /备份目录
可选：--mode package|docker --container 名称 --prefix 目录 --endpoint http://NAS:端口/transmission/web/
      --url HTTPS归档地址 --sha256 摘要 --version v2.0.1 --yes --check
--yes 同意已展示的备份、接入及必要服务重启；不跳过校验或未知环境保护。
离线包旁须有同名.sha256，或明确提供--sha256。不会修改下载任务/daemon设置。
恢复只撤销界面和容器接入，不恢复/覆盖任务数据。备份可能含容器凭据，仅管理员可读。
HELP
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --archive|--url|--sha256|--prefix|--container|--endpoint|--mode|--version|--restore)
      [ "$#" -ge 2 ] || fail "$1 缺少参数"
      case "$1" in --archive) archive=$2;; --url) url=$2;; --sha256) expected=$2;; --prefix) prefix=$2;; --container) container=$2; mode=docker;; --endpoint) endpoint=$2;; --mode) mode=$2;; --version) tag=$2; tag_explicit=1;; --restore) restore=$2; action=restore;; esac
      shift 2;;
    --yes|-y) yes=1; shift;; --check) action=check; shift;; --help|-h) usage; exit 0;; *) fail "未知参数 $1";;
  esac
done
confirm() {
  log "$1"
  [ "$yes" = 1 ] && return 0
  [ -t 0 ] || fail '非交互运行需要--yes；未获得切换授权。'
  printf '继续？[y/N] '; read -r answer
  case "$answer" in y|Y|yes|YES) :;; *) fail '已取消。';; esac
}
ask() {
  [ -t 0 ] || fail "$1：请使用对应参数指定。"
  printf '%s' "$1："; read -r answer
  [ -n "$answer" ] || fail '输入不能为空。'
}
safe_path() {
  case "$1" in /*) :;; *) fail '需要绝对路径。';; esac
  case "$1" in /|/usr|/var|/etc|/opt|/tmp|/root|/home|*/../*|*/./*|*/..|*/.|*//*|*/|*[!A-Za-z0-9_./-]*) fail "不支持的目录：$1（请使用不含空格的独立目录）";; esac
}
json_string() { printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"; }
fetch() {
  case "$1" in https://*) :;; *) fail '发布下载只接受HTTPS。';; esac
  curl --fail --silent --show-error --location --connect-timeout 15 --max-time 180 --proto '=https' --proto-redir '=https' --output "$2" "$1"
}
acquire_lock() {
  if ! mkdir "$backup_root/.lock" 2>/dev/null; then
    [ -f "$backup_root/.lock/pid" ] && [ -f "$backup_root/.lock/start" ] || fail '安装锁状态不完整，保留现场，不能自动删除未知锁。'
    lock_pid=$(cat "$backup_root/.lock/pid")
    case "$lock_pid" in ''|*[!0-9]*) fail '安装锁PID无效。';; esac
    lock_start=$(awk '{ sub(/^.*\) /, ""); print $20 }' "/proc/$lock_pid/stat" 2>/dev/null || :)
    if [ -n "$lock_start" ] && [ "$lock_start" = "$(cat "$backup_root/.lock/start")" ]; then fail '另一安装/恢复操作仍在运行。'; fi
    rm "$backup_root/.lock/pid" "$backup_root/.lock/start"
    rmdir "$backup_root/.lock" || fail '锁目录含未知文件，保留现场。'
    mkdir "$backup_root/.lock" || fail '无法取得安装锁。'
    log '已识别并清理中断进程留下的安装锁。'
  fi
  printf '%s\n' "$$" > "$backup_root/.lock/pid"
  awk '{ sub(/^.*\) /, ""); print $20 }' /proc/$$/stat > "$backup_root/.lock/start"
  locked=1
}
record() { printf '%s\n' "$2" > "$tx/$1"; }
get() { cat "$tx/$1"; }
atomic_link() {
  rm -f "$prefix/.twui-next-link"
  ln -s "$2" "$prefix/.twui-next-link"
  # mv into parent uses the capability already probed by the core installer.
  mkdir "$prefix/.twui-switch-$$"
  mv "$prefix/.twui-next-link" "$prefix/.twui-switch-$$/$1"
  mv -f "$prefix/.twui-switch-$$/$1" "$prefix/"
  rmdir "$prefix/.twui-switch-$$"
}
restore_links() {
  for item in current previous; do
    saved=$(get "$item")
    if [ -n "$saved" ]; then atomic_link "$item" "$saved" || return 1
    elif [ -L "$prefix/$item" ]; then rm "$prefix/$item" || return 1
    elif [ -e "$prefix/$item" ]; then return 1; fi
  done
}
docker_id() { docker inspect --type container --format '{{.Id}}' "$1" 2>/dev/null; }
engine() {
  method=$1; path=$2; data=${3-}
  if [ -n "$data" ]; then
    status=$(curl --silent --show-error --max-time 60 --unix-socket "$socket" -X "$method" -H 'Content-Type: application/json' --data-binary "@$data" -o "$work/engine-response" -w '%{http_code}' "http://localhost/v$api$path") || return 1
  else
    status=$(curl --silent --show-error --max-time 60 --unix-socket "$socket" -X "$method" -o "$work/engine-response" -w '%{http_code}' "http://localhost/v$api$path") || return 1
  fi
  case "$status" in 2??) return 0;; *) log "Docker API返回$status；详情已保存在私有工作目录。" >&2; return 1;; esac
}
setup_engine() {
  need docker
  host=$(docker context inspect --format '{{(index .Endpoints "docker").Host}}')
  host=${DOCKER_HOST:-$host}
  case "$host" in unix:///*) socket=${host#unix://};; *) fail '自动安装仅支持本机Docker Unix socket，拒绝误操作远程Docker。';; esac
  api=$(docker version --format '{{.Server.APIVersion}}')
  case "$api" in *[!0-9.]*|'') fail '无法确定Docker API版本。';; esac
  curl --silent --show-error --fail --max-time 10 --unix-socket "$socket" http://localhost/_ping >/dev/null || fail '无法连接本机Docker API（curl需支持Unix socket）。'
}
restart_package() { synopkg restart transmission >/dev/null; }
verify_recovery_tree() {
  recovery_source=$1
  (cd "$tx/old-web" && find . -type f | sort) > "$work/recovery-files" || return 1
  while IFS= read -r recovery_file; do
    [ -f "$recovery_source/$recovery_file" ] || return 1
    cmp -s "$tx/old-web/$recovery_file" "$recovery_source/$recovery_file" || { log '原资源已被外部修改，保留当前服务，停止恢复。'; return 1; }
  done < "$work/recovery-files"
}
rollback() {
  log '正在恢复安装前状态……'
  mode=$(get mode); prefix=$(get prefix)
  # Do not follow an installation root that was replaced while the transaction ran.
  if [ -e "$prefix" ] || [ -L "$prefix" ]; then
    [ -d "$prefix" ] && [ ! -L "$prefix" ] && [ ! -L "$prefix/releases" ] || return 1
    [ -f "$prefix/.twui-managed" ] && [ ! -L "$prefix/.twui-managed" ] || return 1
    [ "$(cat "$prefix/.twui-managed")" = transmission-web-ui-v1 ] || return 1
    for entry in current previous; do
      if [ -e "$prefix/$entry" ] && [ ! -L "$prefix/$entry" ]; then return 1; fi
    done
  elif [ -n "$(get current)$(get previous)" ]; then return 1; fi
  if [ "$mode" = docker ]; then
    name=$(get name); original_id=$(get original-id)
    # Establish recoverability before touching the currently serving container.
    [ "$(docker_id "$original_id")" = "$original_id" ] || { log '原容器已不存在，保留当前容器，停止恢复。'; return 1; }
    saved_current=$(get current)
    if [ -n "$saved_current" ]; then
      verify_recovery_tree "$prefix/$saved_current" || return 1
    else
      mkdir "$work/recovery-web" || return 1
      docker cp -L "$original_id:$(get original-web)/." "$work/recovery-web/" >/dev/null || return 1
      verify_recovery_tree "$work/recovery-web" || return 1
    fi
    # Never delete an unrelated replacement container, nor any data volume.
    current_id=$(docker_id "$name" || :)
    if [ -n "$current_id" ] && [ "$current_id" != "$original_id" ]; then
      owner=$(docker inspect --format '{{index .Config.Labels "io.transmission-web-ui.transaction"}}' "$current_id") || return 1
      [ "$owner" = "$(get transaction)" ] || { log '容器被外部替换，停止自动恢复，保留备份。'; return 1; }
      docker stop "$current_id" >/dev/null || return 1
      docker rm "$current_id" >/dev/null || return 1
    fi
    [ "$(docker_id "$original_id")" = "$original_id" ] || return 1
    restore_links || return 1
    original_name=$(docker inspect --format '{{.Name}}' "$original_id") || return 1
    [ "$original_name" = "/$name" ] || docker rename "$original_id" "$name" || return 1
    docker start "$original_id" >/dev/null || return 1
  else
    old_link=$(get xdg-link)
    displaced=$(get displaced)
    saved_current=$(get current)
    if [ -n "$saved_current" ]; then recovery_web=$prefix/$saved_current
    elif [ -e "$displaced" ] || [ -L "$displaced" ]; then recovery_web=$displaced
    else recovery_web=$(get original-web); fi
    verify_recovery_tree "$recovery_web" || return 1
    if [ -e "$displaced" ] || [ -L "$displaced" ]; then
      if [ -L "$old_link" ] && [ "$(readlink "$old_link")" = "$prefix/current" ]; then rm "$old_link" || return 1
      elif [ -e "$old_link" ] || [ -L "$old_link" ]; then return 1; fi
      mv "$displaced" "$old_link" || return 1
    elif [ "$(get had-xdg)" = 0 ]; then
      if [ -L "$old_link" ] && [ "$(readlink "$old_link")" = "$prefix/current" ]; then rm "$old_link" || return 1
      elif [ -e "$old_link" ] || [ -L "$old_link" ]; then return 1; fi
    else
      [ -e "$old_link" ] || [ -L "$old_link" ] || return 1
    fi
    restore_links || return 1
    if [ -f "$tx/registration" ]; then cp -p "$tx/registration" "$prefix/.synocommunity-xdg" || return 1
    else rm -f "$prefix/.synocommunity-xdg" || return 1; fi
    restart_package || return 1
  fi
  # Verify the old entry and read-only RPC, rather than reporting a successful copy as recovery.
  verify_endpoint "$(get old-entry-sha)" "$tx/old-web" || return 1
  record status rolled-back
  rm -f "$backup_root/pending"
  log "已恢复原界面及服务接入，备份保留：$tx"
}
cleanup() {
  code=$?
  trap - EXIT INT TERM HUP
  [ "$terminal_hidden" = 0 ] || stty echo 2>/dev/null || :
  if [ "$mutating" = 1 ] && [ "$finished" = 0 ]; then
    set +e
    rollback
    recovery=$?
    if [ "$recovery" != 0 ]; then
      record status recovery-required
      log "自动恢复未完成。原资源/容器及日志已保留，请再次运行：sh install-transmission-web-ui.sh --restore $tx" >&2
    fi
    code=1
  fi
  if [ "$locked" = 1 ]; then
    rm -f "$backup_root/.lock/pid" "$backup_root/.lock/start"
    rmdir "$backup_root/.lock" 2>/dev/null || :
  fi
  if [ -n "$tx" ] && [ -d "$tx" ] && [ -n "$work" ]; then
    for log_file in validation.log install.log attach.log engine-response; do
      [ ! -f "$work/$log_file" ] || cp "$work/$log_file" "$tx/$log_file" || :
    done
  fi
  [ -z "$work" ] || rm -rf "$work"
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
# Root is required to preserve backup ownership and operate the package service.
if [ "$(id -u)" != 0 ]; then
  log '请以管理员运行：sudo sh install-transmission-web-ui.sh（安装器不会修改下载任务）。'
  exit 1
fi
for utility in curl tar sha256sum awk sed grep sort uniq find chmod chown mkdir mktemp rm cp mv ln readlink cat rmdir id date df du sleep stat cmp tr head wc dirname basename cut; do need "$utility"; done
work=$(mktemp -d "${TMPDIR:-/tmp}/twui-wizard.XXXXXXXX")
extract_helpers
# Authentication stays in a private curl config, never in argv, backups, or logs.
: > "$work/http-auth"
http() {
  request_url=$1; body=$2
  curl --silent --show-error --location --max-redirs 3 --connect-timeout 5 --max-time 15 --config "$work/http-auth" --output "$body" --write-out '%{http_code}' "$request_url"
}
credentials() {
  [ -t 0 ] || fail '页面需要认证；请交互运行安装器输入凭据，不要把密码放入命令行。'
  ask 'Transmission用户名'; rpc_user=$answer
  printf 'Transmission密码（不回显）：'
  need stty
  stty -echo; terminal_hidden=1; IFS= read -r rpc_password; stty echo; terminal_hidden=0; printf '\n'
  if printf '%s' "$rpc_user$rpc_password" | LC_ALL=C grep -q '[[:cntrl:]]'; then fail '凭据不能包含控制字符。'; fi
  case "$rpc_user" in *:*) fail '用户名不能包含冒号。';; esac
  printf 'user = %s\n' "$(json_string "$rpc_user:$rpc_password")" > "$work/http-auth"
  unset rpc_password rpc_user
}
rpc_call() {
  rpc_request=$1
  rpc_url=${endpoint%web/}rpc
  code=$(curl --silent --show-error --connect-timeout 5 --max-time 10 --config "$work/http-auth" -D "$work/rpc-headers" -o "$work/rpc-body" -w '%{http_code}' -H 'Content-Type: application/json' --data "$rpc_request" "$rpc_url") || return 1
  if [ "$code" = 409 ]; then
    session=$(sed -n 's/^[Xx]-[Tt]ransmission-[Ss]ession-[Ii]d:[[:space:]]*//p' "$work/rpc-headers" | tr -d '\r')
    [ -n "$session" ] || return 1
    code=$(curl --silent --show-error --connect-timeout 5 --max-time 10 --config "$work/http-auth" -o "$work/rpc-body" -w '%{http_code}' -H "X-Transmission-Session-Id: $session" -H 'Content-Type: application/json' --data "$rpc_request" "$rpc_url") || return 1
  fi
  [ "$code" = 200 ] && grep -Eq '"result"[[:space:]]*:[[:space:]]*"success"' "$work/rpc-body"
}
check_rpc() { rpc_call '{"method":"session-get"}'; }
check_docker_persistence() {
  persistence_id=$1
  check_rpc || fail '无法再次读取daemon持久化路径，未重建。'
  LC_ALL=C awk -v kind=session -f "$work/json-paths.awk" "$work/rpc-body" > "$work/session-paths" || fail '无法严格解析daemon路径，未重建。'
  grep -q '^/arguments/config-dir' "$work/session-paths" && grep -q '^/arguments/download-dir' "$work/session-paths" || fail 'daemon未报告配置或默认下载目录，未重建。'
  awk -F '\t' '$1=="/arguments/config-dir" || $1=="/arguments/download-dir" {print $2}' "$work/session-paths" > "$work/data-paths"
  if grep -q '^/arguments/incomplete-dir-enabled[[:space:]]true$' "$work/session-paths"; then
    grep -q '^/arguments/incomplete-dir[[:space:]]' "$work/session-paths" || fail '缺少未完成下载目录。'
    awk -F '\t' '$1=="/arguments/incomplete-dir" {print $2}' "$work/session-paths" >> "$work/data-paths"
  fi
  rpc_call '{"method":"torrent-get","arguments":{"fields":["downloadDir"]}}' || fail '无法核对现有任务目录，未重建。'
  LC_ALL=C awk -v kind=torrents -f "$work/json-paths.awk" "$work/rpc-body" > "$work/task-paths" || fail '无法严格解析任务目录，未重建。'
  cut -f 2- "$work/task-paths" >> "$work/data-paths"
  docker inspect --format '{{range .Mounts}}{{if or (eq .Type "bind") (eq .Type "volume")}}{{println .Destination}}{{end}}{{end}}' "$persistence_id" > "$work/persistent-mounts"
  sort -u "$work/data-paths" > "$work/unique-data-paths"
  while IFS= read -r state_path; do
    case "$state_path" in */../*|*/..|*/./*|*/.) fail '数据路径包含相对目录段，无法安全核实持久化挂载。';; esac
    resolved=$(docker exec "$persistence_id" sh -c '
      p=$1; suffix=
      while [ ! -e "$p" ] && [ ! -L "$p" ]; do
        suffix=/${p##*/}$suffix; p=${p%/*}; [ -n "$p" ] || p=/
      done
      p=$(readlink -f "$p") || exit 1
      printf "%s%s\n" "${p%/}" "$suffix"
    ' sh "$state_path") || fail '无法解析持久化目录的实际路径。'
    covered=0
    while IFS= read -r mount_path; do
      [ -n "$mount_path" ] || continue
      case "$resolved/" in "$mount_path/"*) covered=1;; esac
    done < "$work/persistent-mounts"
    [ "$covered" = 1 ] || fail "目录未位于持久化挂载内：$state_path。重建会丢失数据，已停止。"
  done < "$work/unique-data-paths"
}
check_writable_layer() {
  docker diff "$1" > "$work/writable-layer" || return 1
  # Docker reports newly created mountpoint directories as layer additions.
  # Only exact persistent mount roots and Transmission temporary session-id files
  # are safe to recreate; all other added/changed/deleted files stop installation.
  docker inspect --format '{{range .Mounts}}{{if or (eq .Type "bind") (eq .Type "volume")}}{{println .Destination}}{{end}}{{end}}' "$1" > "$work/layer-mounts" || return 1
  awk 'NR==FNR {if(length($0)) mounts[$0]=1; next} {path=substr($0,3); if ($0=="C /tmp" || $0 ~ /^A \/tmp\/tr_session_id_[A-Za-z0-9]+$/) next; if (!(path in mounts) || substr($0,1,1)=="D") print}' "$work/layer-mounts" "$work/writable-layer" > "$work/unsafe-layer"
  [ ! -s "$work/unsafe-layer" ] || { log '检测到容器可写层修改，不能保证按原镜像重建不丢失文件；未重建。请先把需保留的配置/文件置于持久化挂载。' >&2; return 1; }
}
url_path() {
  printf '%s' "$1" | LC_ALL=C awk 'BEGIN {for(i=1;i<256;i++)ord[sprintf("%c",i)]=i} {for(i=1;i<=length($0);i++){c=substr($0,i,1);if(c ~ /[A-Za-z0-9_~.\/-]/)printf "%s",c;else printf "%%%02X",ord[c]}}'
}
verify_endpoint() {
  digest=$1; web=$2; attempt=0
  while [ "$attempt" -lt 20 ]; do
    code=$(http "$endpoint" "$work/index-check" 2>/dev/null || :)
    if [ "$code" = 200 ] && [ "$(sha256sum "$work/index-check" | awk '{print $1}')" = "$digest" ] && check_rpc; then break; fi
    if [ "$code" = 401 ] && [ -t 0 ] && [ ! -s "$work/http-auth" ]; then credentials; fi
    attempt=$((attempt+1)); sleep 2
  done
  [ "$attempt" -lt 20 ] || return 1
  if [ -n "$web" ]; then
    (cd "$web" && find . -type f | sort) > "$work/http-files"
    while IFS= read -r relative; do
      relative=${relative#./}
      code=$(http "$endpoint$(url_path "$relative")" "$work/asset-check") || return 1
      [ "$code" = 200 ] || return 1
      [ "$(sha256sum "$work/asset-check" | awk '{print $1}')" = "$(sha256sum "$web/$relative" | awk '{print $1}')" ] || return 1
    done < "$work/http-files"
  fi
}
# The package helper emits only non-secret process identity and resource paths.
inspect_package() {
  need sudo; need synopkg
  sudo -u sc-transmission -- sh -s -- --inspect < "$work/synocommunity.sh" > "$work/package-inspect" || fail '套件预检失败；未修改界面。'
  cat "$work/package-inspect"
  old_link=$(sed -n 's/^Candidate link: //p' "$work/package-inspect")
  safe_path "$old_link"
  pkgvar=$(readlink -f "$package_root/var")
  [ -n "$prefix" ] || prefix=$pkgvar/transmission-web-ui
  if [ -r "$old_link/index.html" ]; then original_web=$(readlink -f "$old_link")
  else
    original_web=$package_root/target/share/transmission/public_html
    [ -r "$original_web/index.html" ] || original_web=$package_root/target/share/transmission/web
    original_web=$(readlink -f "$original_web")
  fi
  [ -r "$original_web/index.html" ] || fail '无法确定正在使用的旧Web资源，未修改。'
  if [ -z "$endpoint" ]; then
    port=$(sed -n 's/.*"rpc-port"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$pkgvar/settings.json" | head -n 1)
    [ -n "$port" ] || port=9091
    endpoint=http://127.0.0.1:$port/transmission/web/
  fi
}
inspect_docker() {
  setup_engine
  if [ -z "$container" ]; then
    docker ps --format '{{.Names}} {{.Image}}' | awk 'tolower($0) ~ /transmission/ {print $1}' > "$work/containers"
    count=$(wc -l < "$work/containers" | tr -d ' ')
    if [ "$count" = 1 ]; then container=$(cat "$work/containers")
    else docker ps --format '  {{.Names}}  {{.Image}}'; ask '请输入现有Transmission容器名称'; container=$answer; fi
  fi
  case "$container" in ''|*[!A-Za-z0-9_.-]*) fail '容器名称无效。';; esac
  original_id=$(docker_id "$container") || fail '找不到容器。'
  name=$(docker inspect --format '{{.Name}}' "$original_id"); name=${name#/}
  [ "$(docker inspect --format '{{.State.Running}}' "$original_id")" = true ] || fail '请先启动现有Transmission容器，以核对原页面。'
  [ "$(docker inspect --format '{{.HostConfig.AutoRemove}}' "$original_id")" = false ] || fail '--rm容器停止后会被删除，不能安全保留原容器。'
  swarm=$(docker inspect --format '{{index .Config.Labels "com.docker.swarm.service.id"}}' "$original_id")
  [ -z "$swarm" ] || fail '此容器由Swarm管理，不能绕过编排器替换。'
  compose=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$original_id")
  [ -z "$compose" ] || fail '此容器由Compose管理。需要通过Compose配置接入，当前不会绕过编排器破坏其配置。'
  random_port=$(docker inspect --format '{{range .HostConfig.PortBindings}}{{range .}}{{if or (eq .HostPort "") (eq .HostPort "0")}}random{{end}}{{end}}{{end}}' "$original_id")
  [ -z "$random_port" ] || fail '容器使用随机宿主端口，重启后原地址可能变化；不能保证原地址回滚。请先在容器管理界面固定现有端口。'
  network_mode=$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$original_id")
  case "$network_mode" in container:*|none) fail '共享容器网络或无网络容器无法自动验证，未修改。';; esac
  # Fixed addresses would remain reserved by the retained old container.
  fixed=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{if .IPAMConfig}}{{if .IPAMConfig.IPv4Address}}static{{end}}{{if .IPAMConfig.IPv6Address}}static{{end}}{{end}}{{end}}' "$original_id")
  [ -z "$fixed" ] || fail '固定容器IP需保持网络身份，当前不自动重建此容器。'
  docker inspect --format '{{range .Mounts}}{{println .Destination}}{{end}}' "$original_id" > "$work/mounts"
  managed=$(docker inspect --format '{{index .Config.Labels "io.transmission-web-ui.prefix"}}' "$original_id")
  if [ -n "$managed" ]; then
    safe_path "$managed"
    source=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/twui-managed"}}{{.Source}}{{end}}{{end}}' "$original_id")
    [ "$source" = "$managed" ] || fail '原受管理挂载已被外部修改。'
    [ -z "$prefix" ] || [ "$prefix" = "$managed" ] || fail '升级需沿用已管理目录。'
    prefix=$managed; reuse=1
  elif grep -Eq '^/twui-managed(/|$)|^/$' "$work/mounts"; then fail '/twui-managed挂载路径已占用，未修改。'; fi
  if [ -z "$prefix" ]; then
    if [ -d /volume1/docker ]; then prefix=/volume1/docker/transmission-web-ui/$name
    else prefix=/opt/transmission-web-ui/$name; fi
  fi
  # Read the actual daemon environment/root inside the running container; no shell interpolation of user input.
  original_web=$(docker exec "$original_id" sh -c '
    for proc in /proc/[0-9]*; do
      [ -r "$proc/comm" ] || continue
      case "$(cat "$proc/comm")" in transmission-da*)
        env=$(tr "\000" "\n" < "$proc/environ") || exit 1
        web=$(printf "%s\n" "$env" | sed -n "s/^CLUTCH_HOME=//p" | head -n 1)
        [ -n "$web" ] || web=$(printf "%s\n" "$env" | sed -n "s/^TRANSMISSION_WEB_HOME=//p" | head -n 1)
        if [ -n "$web" ]; then [ -r "$web/index.html" ] || exit 1; printf "%s\n" "$web"; exit; fi
      ;; esac
    done
    for web in /usr/share/transmission/public_html /usr/share/transmission/web /usr/local/share/transmission/public_html /usr/local/share/transmission/web; do
      if [ -r "$web/index.html" ]; then printf "%s\n" "$web"; exit; fi
    done
    exit 1') || fail '无法识别容器实际Web目录，未修改。'
  safe_path "$original_web"
  if [ -z "$endpoint" ]; then
    binding=$(docker port "$original_id" 9091/tcp 2>/dev/null | head -n 1 || :)
    if [ -n "$binding" ]; then
      port=${binding##*:}; bind_host=${binding%:*}
      case "$bind_host" in 0.0.0.0|'[::]') bind_host=127.0.0.1;; esac
      endpoint=http://$bind_host:$port/transmission/web/
    else ask '请输入现有Web地址（含/transmission/web/）'; endpoint=$answer; fi
  fi
}
load_backup() {
  safe_path "$restore"
  [ -d "$restore" ] && [ ! -L "$restore" ] && [ -f "$restore/installer-version" ] || fail '不是本安装器的备份。'
  # Backup journals are data, never executable shell snippets.
  [ "$(stat -c %u "$restore")" = 0 ] && [ "$(stat -c %a "$restore")" = 700 ] || fail '备份目录必须由root拥有且权限为700。'
  tx=$restore; backup_root=$(dirname "$tx")
  mode=$(get mode); prefix=$(get prefix); endpoint=$(get endpoint)
  safe_path "$prefix"
  case "$mode" in package) need synopkg;; docker) setup_engine;; *) fail '备份环境类型无效。';; esac
  (cd "$tx" && sha256sum -c backup.sha256 >/dev/null && sha256sum -c web.sha256 >/dev/null) || fail '备份摘要不符，未恢复。'
}
if [ "$action" = restore ]; then
  load_backup
  acquire_lock
  code=$(http "$endpoint" "$work/current-page" || :)
  [ "$code" != 401 ] || credentials
  confirm "将恢复备份 $tx。会恢复原Web接入并启动原服务；不回滚下载任务或daemon设置。"
  rollback || fail "恢复尚未完成，备份仍在 $tx；没有删除数据卷。"
  finished=1; exit 0
fi
case "$mode" in auto)
  if [ -r "$package_root/INFO" ] && command -v docker >/dev/null 2>&1; then
    log '检测到群晖套件和Docker。'; ask '选择安装环境：1=套件，2=Docker'
    case "$answer" in 1) mode=package;; 2) mode=docker;; *) fail '无效选择。';; esac
  elif [ -r "$package_root/INFO" ]; then mode=package
  elif command -v docker >/dev/null 2>&1; then mode=docker
  else fail '未检测到受支持的群晖套件或本机Docker；没有猜测系统目录。'; fi;;
  package|docker) :;; *) fail '环境类型应为package或docker。';;
esac
case "$mode" in package) inspect_package;; docker) inspect_docker;; esac
safe_path "$prefix"
[ ! -L "$prefix" ] || fail '安装目录本身不能是软链。'
if [ -e "$prefix" ]; then
  [ -f "$prefix/.twui-managed" ] && [ "$(cat "$prefix/.twui-managed")" = transmission-web-ui-v1 ] || fail '目标目录已有其他内容，拒绝覆盖。'
fi
case "$endpoint" in http://*/transmission/web/|https://*/transmission/web/) :;; *) fail 'Web地址需以/transmission/web/结尾。';; esac
case "$endpoint" in *'@'*|*'?'*|*'#'*|*'"'*|*' '*|*'
'*) fail 'Web地址不能包含凭据、参数或空格。';; esac
code=$(http "$endpoint" "$work/original-index") || fail '无法连接现有Web界面。'
if [ "$code" = 401 ]; then credentials; code=$(http "$endpoint" "$work/original-index"); fi
[ "$code" = 200 ] || fail "原Web页面返回HTTP $code；先保持现状。"
if ! check_rpc; then
  if [ "$code" = 401 ]; then credentials; check_rpc || fail 'RPC认证失败，未开始安装。'
  else fail '原RPC无法通过只读握手，未开始安装。'; fi
fi
if [ "$mode" = docker ] && [ "$reuse" = 0 ]; then
  check_docker_persistence "$original_id"
  check_writable_layer "$original_id" || fail '原容器可写层不能丢弃。'
fi
old_entry_sha=$(sha256sum "$work/original-index" | awk '{print $1}')
if [ "$mode" = package ]; then
  [ "$old_entry_sha" = "$(sha256sum "$original_web/index.html" | awk '{print $1}')" ] || fail '自动识别的目录与实际页面不一致，未修改。'
else
  docker cp -L "$original_id:$original_web/index.html" "$work/container-index" >/dev/null
  [ "$old_entry_sha" = "$(sha256sum "$work/container-index" | awk '{print $1}')" ] || fail '容器识别目录与实际页面不一致，未修改。'
fi
log "环境：$mode；Web地址：$endpoint；安装目录：$prefix"
log '原Web页面和RPC只读检查通过。'
[ "$action" != check ] || { log '只读预检完成；未安装、未重启。'; exit 0; }
if [ -z "$archive" ] && [ -z "$url" ] && [ "$tag_explicit" = 0 ] && command -v extract_bundled_release >/dev/null 2>&1; then
  need base64
  log '正在校验单文件安装器内置的离线发布包……'
  extract_bundled_release || fail '内置发布包解码失败。'
fi
if [ -z "$archive" ] && [ -z "$url" ]; then
  script_dir=$(CDPATH='' cd -- "$(dirname "$0")" && pwd)
  if [ "$tag_explicit" = 0 ] && [ -f "$script_dir/transmission-web-ui.tar.gz" ]; then archive=$script_dir/transmission-web-ui.tar.gz
  else
    case "$tag" in latest) url=https://github.com/nimbusking/transmission-web-ui/releases/latest/download/transmission-web-ui.tar.gz;;
      v[0-9]*) case "$tag" in *[!A-Za-z0-9.-]*) fail '版本标识无效。';; esac; url=https://github.com/nimbusking/transmission-web-ui/releases/download/$tag/transmission-web-ui.tar.gz;;
      *) fail '版本参数须为latest或v开头的版本。';; esac
  fi
fi
if [ -n "$url" ]; then
  [ -z "$archive" ] || fail '不能同时指定--archive和--url。'
  log '正在获取发布包及摘要……'
  fetch "$url" "$work/release.tar.gz" || fail '发布包下载失败（可能尚未发布或网络不可达）。可把离线包transmission-web-ui.tar.gz及.sha256放到本脚本旁重新运行。'
  archive=$work/release.tar.gz
  if [ -z "$expected" ]; then fetch "$url.sha256" "$work/release.sha256" || fail '无法获取发布摘要，拒绝安装。'; expected=$(awk 'NR==1 {print $1}' "$work/release.sha256"); fi
elif [ -z "$expected" ]; then
  [ -r "$archive.sha256" ] || fail '离线包缺少同名.sha256；不会跳过校验。'
  expected=$(awk 'NR==1 {print $1}' "$archive.sha256")
fi
[ -f "$archive" ] || fail '安装包不存在。'
printf '%s\n' "$expected" | grep -Eq '^[0-9a-f]{64}$' || fail 'SHA256摘要格式不正确。'
[ "$(sha256sum "$archive" | awk '{print $1}')" = "$expected" ] || fail '下载包SHA256不匹配；未修改现有界面。'
# Validate archive paths, types and all file hashes in a private temporary prefix first.
sh "$work/install.sh" --prefix "$work/validated" --archive "$archive" > "$work/validation.log" 2>&1 || { cat "$work/validation.log"; fail '包内部验证失败。'; }
selected=$(cat "$work/validated/current/../VERSION")
if [ -e "$prefix/releases/$selected" ]; then
  if cmp -s "$prefix/releases/$selected/SHA256SUMS" "$work/validated/current/../SHA256SUMS"; then
    log "版本$selected已安装，内容一致，将核验后重新接入。"
  else fail "已存在内容不同的$selected，请使用具有新版本号的发布包，拒绝覆盖。"; fi
fi
backup_root=$(dirname "$prefix")/.twui-backups-$(basename "$prefix")
[ ! -L "$backup_root" ] || fail '备份目录不能为软链。'
if [ -e "$backup_root" ]; then [ "$(stat -c %u "$backup_root")" = 0 ] || fail '现有备份目录不属于root，拒绝使用。'; fi
mkdir -p "$backup_root"; chmod 700 "$backup_root"
if [ -f "$backup_root/pending" ]; then
  pending=$(cat "$backup_root/pending")
  fail "检测到未完成的安装。先执行本脚本 --restore $backup_root/$pending；不会覆盖恢复记录。"
fi
acquire_lock
tx=$(mktemp -d "$backup_root/$(date '+%Y%m%d-%H%M%S').XXXXXXXX")
stamp=$(basename "$tx"); chmod 700 "$tx"
record installer-version "$VERSION"; record mode "$mode"; record prefix "$prefix"; record endpoint "$endpoint"
record transaction "$stamp"; record old-entry-sha "$old_entry_sha"; record archive-sha "$expected"; record selected "$selected"
record original-web "$original_web"
record current "$(readlink "$prefix/current" 2>/dev/null || :)"
record previous "$(readlink "$prefix/previous" 2>/dev/null || :)"
record status preparing
log '正在备份完整旧Web资源和接入信息（不是只备份首页）……'
if [ "$mode" = docker ]; then old_kb=$(docker exec "$original_id" du -sk "$original_web/" | awk '{print $1}')
else old_kb=$(du -sk "$original_web/" | awk '{print $1}'); fi
new_kb=$(du -sk "$work/validated" | awk '{print $1}')
free_kb=$(df -Pk "$backup_root" | awk 'END {print $4}')
case "$old_kb:$new_kb:$free_kb" in *[!0-9:]*|'') fail '无法核对磁盘空间。';; esac
[ "$free_kb" -gt "$((old_kb + new_kb * 3 + 10240))" ] || fail '安装与备份所需可用空间不足，未切换。'
if [ "$mode" = docker ]; then
  record name "$name"; record original-id "$original_id"
  docker inspect "$original_id" > "$tx/container-inspect.json"
  mkdir "$tx/old-web"
  docker cp -L "$original_id:$original_web/." "$tx/old-web/" >/dev/null || fail '旧界面备份失败，未切换。'
  # Build a create request from original structured fields, not lossy reconstructed CLI flags.
  if [ "$reuse" = 0 ]; then
  {
    printf '{'
    docker inspect --format '{{range $k,$v := .Config}}{{if and (ne $k "Env") (ne $k "Labels") (ne $k "Image")}}{{json $k}}:{{json $v}},{{end}}{{end}}' "$original_id"
    printf '"Image":'; docker inspect --format '{{json .Image}}' "$original_id"
    printf ',"Env":['
    docker inspect --format '{{range .Config.Env}}{{if and (ne (index (split . "=") 0) "TRANSMISSION_WEB_HOME") (ne (index (split . "=") 0) "CLUTCH_HOME")}}{{json .}},{{end}}{{end}}' "$original_id"
    printf '"TRANSMISSION_WEB_HOME=/twui-managed/current"],"Labels":{'
    docker inspect --format '{{range $k,$v := .Config.Labels}}{{if and (ne $k "io.transmission-web-ui.transaction") (ne $k "io.transmission-web-ui.prefix")}}{{json $k}}:{{json $v}},{{end}}{{end}}' "$original_id"
    printf '"io.transmission-web-ui.transaction":'; json_string "$stamp"
    printf ',"io.transmission-web-ui.prefix":'; json_string "$prefix"
    printf '},"HostConfig":{'
    docker inspect --format '{{range $k,$v := .HostConfig}}{{if and (ne $k "Binds") (ne $k "PortBindings")}}{{json $k}}:{{json $v}},{{end}}{{end}}' "$original_id"
    printf '"PortBindings":'; docker inspect --format '{{json .NetworkSettings.Ports}}' "$original_id"
    printf ',"Binds":['
    docker inspect --format '{{range .HostConfig.Binds}}{{json .}},{{end}}' "$original_id"
    # Preserve anonymous/image-declared volumes by binding their actual existing names.
    docker inspect --format '{{$root := .}}{{range .Mounts}}{{if eq .Type "volume"}}{{$dest := .Destination}}{{$explicit := false}}{{range $root.HostConfig.Mounts}}{{if eq .Target $dest}}{{$explicit = true}}{{end}}{{end}}{{range $root.HostConfig.Binds}}{{$parts := split . ":"}}{{if ge (len $parts) 2}}{{if eq (index $parts 1) $dest}}{{$explicit = true}}{{end}}{{end}}{{end}}{{if not $explicit}}{{json (printf "%s:%s:%s" .Name .Destination (or .Mode "rw"))}},{{end}}{{end}}{{end}}' "$original_id"
    json_string "$prefix:/twui-managed:ro"
    printf ']},"NetworkingConfig":{"EndpointsConfig":{'
    docker inspect --format '{{$first := true}}{{range $network,$endpoint := .NetworkSettings.Networks}}{{if not $first}},{{end}}{{$first = false}}{{json $network}}:{"Aliases":{{json $endpoint.Aliases}},"DriverOpts":{{json $endpoint.DriverOpts}}}{{end}}' "$original_id"
    printf '}}}\n'
  } > "$tx/create.json"
  fi
else
  if [ -e "$old_link" ] || [ -L "$old_link" ]; then record had-xdg 1; else record had-xdg 0; fi
  record xdg-link "$old_link"; record displaced "$old_link.twui-original-$stamp"
  [ ! -e "$old_link.twui-original-$stamp" ] && [ ! -L "$old_link.twui-original-$stamp" ] || fail '旧资源保留路径已存在。'
  [ ! -f "$prefix/.synocommunity-xdg" ] || cp -p "$prefix/.synocommunity-xdg" "$tx/registration"
  cp -aL "$original_web" "$tx/old-web" || fail '旧界面备份失败，未切换。'
fi
# Control characters cannot be represented by the line-based recovery inventory.
find "$tx/old-web" -exec sh -c 'for file do if printf "%s" "$file" | LC_ALL=C grep -q "[[:cntrl:]]"; then printf "unsafe\n"; fi; done' sh {} + > "$work/unsafe-names"
[ ! -s "$work/unsafe-names" ] || fail '旧资源包含控制字符文件名，无法可靠记录恢复清单，未切换。'
# Verify the complete backup copy is readable and save checksums before activation.
(cd "$tx" && find old-web -type f -exec sha256sum {} \;) > "$tx/web.sha256"
(cd "$tx" && sha256sum -c web.sha256 >/dev/null) || fail '备份校验失败。'
[ "$(sha256sum "$tx/old-web/index.html" | awk '{print $1}')" = "$old_entry_sha" ] || fail '备份首页与实际服务不一致。'
(cd "$tx" && find . -maxdepth 1 -type f ! -name status ! -name backup.sha256 -exec sha256sum {} \;) > "$work/backup.sha256"
cp "$work/backup.sha256" "$tx/backup.sha256"
record status prepared
log "备份已验证：$tx"
confirm "准备安装$selected。会短暂停止/启动当前Transmission服务以接入新界面。下载配置和数据卷保持；失败将自动恢复，原容器/资源不会删除。"
# Recheck the instance identity after the user confirmation, before changing anything.
if [ "$mode" = docker ]; then [ "$(docker_id "$name")" = "$original_id" ] || fail '确认期间容器已变化，停止。'; fi
printf '%s\n' "$stamp" > "$backup_root/pending"
record status activating; mutating=1
if [ -d "$prefix/releases/$selected" ]; then
  sh "$work/install.sh" --prefix "$prefix" --rollback "$selected" > "$work/install.log" 2>&1
else
  sh "$work/install.sh" --prefix "$prefix" --archive "$archive" > "$work/install.log" 2>&1
fi
if [ "$mode" = docker ] && [ "$reuse" = 0 ]; then
  check_docker_persistence "$original_id"
  check_writable_layer "$original_id" || fail '确认期间容器可写层已变化。'
  docker stop "$original_id" >/dev/null
  check_writable_layer "$original_id" || fail '停止期间出现可写层修改，恢复原容器。'
  docker rename "$original_id" "$name-twui-backup-$stamp"
  engine POST "/containers/create?name=$name" "$tx/create.json" || fail 'Docker创建失败；开始恢复原容器。'
  new_id=$(docker_id "$name") || fail '无法确认新容器身份。'
  [ "$(docker inspect --format '{{index .Config.Labels "io.transmission-web-ui.transaction"}}' "$new_id")" = "$stamp" ] || fail '新容器身份不匹配。'
  docker start "$new_id" >/dev/null || fail '新容器无法启动。'
elif [ "$mode" = package ]; then
  chown sc-transmission "$prefix"
  if [ -e "$old_link" ] || [ -L "$old_link" ]; then mv "$old_link" "$old_link.twui-original-$stamp"; fi
  sudo -u sc-transmission -- sh "$prefix/releases/$selected/synocommunity.sh" --attach --prefix "$prefix" > "$work/attach.log" 2>&1 || { cat "$work/attach.log"; fail '套件接入失败。'; }
  restart_package || fail '套件重启失败。'
fi
new_sha=$(sha256sum "$prefix/current/index.html" | awk '{print $1}')
verify_endpoint "$new_sha" "$prefix/current" || fail '新界面或RPC验证失败；开始自动回滚。'
if [ "$mode" = docker ] && [ "$reuse" = 0 ]; then check_docker_persistence "$new_id"; fi
record status committed
printf '%s\n' "$stamp" > "$backup_root/latest"
rm -f "$backup_root/pending"
finished=1; mutating=0
log "安装完成：$endpoint"
log "完整资源及RPC只读验证通过。恢复入口：sudo sh install-transmission-web-ui.sh --restore $tx"
log '备份和原容器/旧资源已保留；请勿在确认实际使用前删除。浏览器标签/偏好仍保留在原浏览器中；界面恢复不会撤销任务操作。'
