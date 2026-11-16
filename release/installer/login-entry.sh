# Sourced by the integrated installer; all rollback data belongs to its transaction.
login_root=/usr/local/share/transmission-web-ui-login
login_conf=/etc/nginx/conf.d/http.transmission-web-ui-login.conf
login_state=off
login_port() { sed -n 's/^[[:space:]]*"rpc-port"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' /var/packages/transmission/var/settings.json; }
login_set_port() {
  [ "$(login_port)" = "$1" ] || return 1
  sed "s/\(\"rpc-port\"[[:space:]]*:[[:space:]]*\)$1\([[:space:]]*[,}]*[[:space:]]*\)$/\1$2\2/" /var/packages/transmission/var/settings.json > "$work/login-settings"
  cat "$work/login-settings" > /var/packages/transmission/var/settings.json || return 1
  rm "$work/login-settings"
  [ "$(login_port)" = "$2" ]
}
login_inspect() {
  if [ "$mode" != package ]; then
    [ "$login_page" != on ] || fail '内置登录入口目前支持DSM套件；Docker需配置独立代理。'
    return
  fi
  if [ -e "$login_conf" ] || [ -L "$login_conf" ]; then
    [ "$login_page" != off ] || fail '已存在受管理登录入口，不能跳过它更新界面。'
    [ -d "$login_root" ] && [ ! -L "$login_root" ] && [ "$(stat -c %u "$login_root")" = 0 ] || fail '登录入口目录身份不符。'
    [ "$(cat "$login_root/.managed" 2>/dev/null)" = twui-login-v1 ] || fail '不是受管理的登录入口。'
    [ ! -L "$login_conf" ] && cmp -s "$login_conf" "$work/login-nginx.conf" && cmp -s "$login_conf" "$login_root/nginx.conf" || fail '登录入口配置已修改，拒绝覆盖。'
    [ "$(login_port)" = 9093 ] && [ -r "$login_root/web/index.html" ] || fail '登录入口状态不完整。'
    login_state=existing
  else
    [ "$login_page" != off ] || return 0
    if [ "$login_page" = auto ] && [ ! -f /etc.defaults/VERSION ]; then return; fi
    [ "$(login_port)" = 9091 ] || fail '首次创建登录入口目前要求原RPC端口9091；可用--login-page off保留原认证入口。'
    [ ! -e "$login_root" ] && [ ! -L "$login_root" ] || fail '登录入口目录已存在但配置缺失，请先恢复原事务。'
    login_anon=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:9091/transmission/web/) || fail '无法检查原入口认证。'
    [ "$login_anon" = 401 ] || { [ "$login_page" != on ] || fail '原服务未启用预期的密码认证。'; return 0; }
    need netstat
    if netstat -lnt | awk '$4 ~ /:9093$/ {found=1} END {exit !found}'; then fail '登录入口需要的9093端口已占用。'; fi
    login_state=new
  fi
  need nginx
  grep -Fq 'include conf.d/http.*.conf;' /etc/nginx/nginx.conf || fail 'DSM nginx配置入口不匹配。'
  nginx -t || fail '现有nginx配置无效。'
  case "$endpoint" in http://127.0.0.1:9091/transmission/web/|http://127.0.0.1:9093/transmission/web/) :;; *) fail '登录入口集成需要默认本机endpoint，请移除自定义--endpoint。';; esac
  log '登录入口已纳入本次安装：网页保持9091；RPC继续密码认证；安装、升级和恢复同步处理登录资源。'
}
login_snapshot() {
  record login-state "$login_state"
  [ "$login_state" != off ] || return 0
  record login-port "$(login_port)"
  if [ "$login_state" = existing ]; then
    cp -aL "$login_root/web" "$tx/login-old-web" || fail '登录资源备份失败。'
    (cd "$tx" && find login-old-web -type f -exec sha256sum {} \;) > "$tx/login.sha256"
    (cd "$tx" && sha256sum -c login.sha256 >/dev/null) || fail '登录资源备份校验失败。'
  fi
}
login_publish_web() {
  # Preserve a legacy real directory; subsequent upgrades use an atomic symlink switch.
  if [ -e "$login_root/web" ] && [ ! -L "$login_root/web" ]; then
    [ ! -e "$login_root/legacy-web-$(basename "$tx")" ] || return 1
    mv "$login_root/web" "$login_root/legacy-web-$(basename "$tx")" || return 1
  fi
  login_switch=$(mktemp -d "$login_root/.switch.XXXXXXXX") || return 1
  ln -s "$1" "$login_switch/web" && mv -f "$login_switch/web" "$login_root/" || return 1
  rmdir "$login_switch"
}
login_stage_web() {
  login_release=$login_root/releases/$2
  [ ! -e "$login_release" ] && [ ! -L "$login_release" ] || return 1
  mkdir -p "$login_release" || return 1
  cp -aL "$1" "$login_release/web" || return 1
  find "$login_root/releases" -type d -exec chmod 755 {} \; || return 1
  find "$login_release/web" -type f -exec chmod 644 {} \; || return 1
  login_publish_web "releases/$2/web"
}
login_verify() {
  login_code=$(curl -sS --max-time 10 -D "$work/login-headers" -o "$work/login-index" -w '%{http_code}' http://127.0.0.1:9091/transmission/web/) || return 1
  [ "$login_code" = 200 ] && ! grep -qi '^WWW-Authenticate:' "$work/login-headers" || return 1
  cmp -s "$work/login-index" "$login_root/web/index.html" || return 1
  login_code=$(curl -sS --max-time 10 -X POST -D "$work/login-headers" -o /dev/null -w '%{http_code}' http://127.0.0.1:9091/transmission/rpc) || return 1
  [ "$login_code" = 401 ] && ! grep -qi '^WWW-Authenticate:' "$work/login-headers" || return 1
  login_saved_endpoint=$endpoint
  endpoint=http://127.0.0.1:9091/transmission/web/
  login_ok=0
  verify_endpoint "$(sha256sum "$login_root/web/index.html" | awk '{print $1}')" "$login_root/web" || login_ok=$?
  endpoint=$login_saved_endpoint
  return "$login_ok"
}
login_activate() {
  [ "$login_state" != off ] || return 0
  # Journal precedes the first mutation, including an interrupted initial creation.
  printf 'started\n' > "$tx/login-progress"
  if [ "$login_state" = new ]; then
    mkdir -m 755 "$login_root" || return 1
    printf 'twui-login-v1\n' > "$login_root/.managed"
    cp "$work/login-nginx.conf" "$login_root/nginx.conf" || return 1
  fi
  login_stage_web "$prefix/current" "$(basename "$tx")" || return 1
  if [ "$login_state" = new ]; then
    cp "$work/login-nginx.conf" "$login_conf" || return 1
    nginx -t || return 1
    synopkg stop transmission >/dev/null || return 1
    cp -p /var/packages/transmission/var/settings.json "$tx/login-settings-before" || return 1
    login_set_port 9091 9093 || return 1
    synopkg start transmission >/dev/null || return 1
    nginx -s reload || return 1
  fi
  # nginx reload and daemon startup are asynchronous.
  login_attempt=0
  while [ "$login_attempt" -lt 20 ]; do
    if login_verify; then return 0; fi
    sleep 1; login_attempt=$((login_attempt + 1))
  done
  return 1
}
login_rollback() {
  [ -f "$tx/login-progress" ] || return 0
  login_previous=$(get login-state)
  [ ! -L "$login_root" ] || return 1
  if [ -e "$login_conf" ]; then cmp -s "$login_conf" "$work/login-nginx.conf" || return 1; fi
  case "$login_previous" in
    existing)
      (cd "$tx" && sha256sum -c login.sha256 >/dev/null) || return 1
      # Copy into a new directory; preserve every prior version and interrupted stage.
      login_recovery=$(mktemp -d "$login_root/releases/recovery.XXXXXXXX") || return 1
      cp -aL "$tx/login-old-web" "$login_recovery/web" || return 1
      chmod 755 "$login_recovery"
      login_publish_web "releases/${login_recovery##*/}/web" || return 1
      ;;
    new)
      if [ -e "$login_conf" ]; then
        rm "$login_conf" || return 1
        nginx -t && nginx -s reload || return 1
        sleep 2
      fi
      synopkg stop transmission >/dev/null || return 1
      case "$(login_port)" in 9093) login_set_port 9093 9091 || return 1;; 9091) :;; *) return 1;; esac
      # Preserve repair artifacts while freeing the canonical path for a new installation.
      if [ -d "$login_root" ]; then
        login_retained=$login_root.restored-$(basename "$tx")
        [ ! -e "$login_retained" ] || return 1
        mv "$login_root" "$login_retained" || return 1
      fi
      ;;
    *) return 1;;
  esac
}
