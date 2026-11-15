#!/bin/sh
# Isolated Linux test fixture. This is not a DSM installer or a replacement SPK.
set -eu
pkg=/var/packages/transmission
if ! id sc-transmission >/dev/null 2>&1; then
  printf 'sc-transmission:x:12345:12345:Transmission fixture:%s/var:/bin/bash\n' "$pkg" >> /etc/passwd
  printf 'sc-transmission:x:12345:\n' >> /etc/group
  printf 'sc-transmission:!:20000:0:99999:7:::\n' >> /etc/shadow
fi
mkdir -p "$pkg/scripts" "$pkg/var" /managed /data /usr/local/share/transmission/public_html /tmp/busybox-bin
chown 12345:12345 "$pkg/var" /managed /data
[ -e "$pkg/target" ] || ln -s /usr/local "$pkg/target"
printf '%s\n' 'package="transmission"' 'maintainer="SynoCommunity"' 'version="4.1.4-32"' > "$pkg/INFO"
cp /repo/.lab/synocommunity-upstream/start-stop-status "$pkg/scripts/start-stop-status"
cat > "$pkg/scripts/service-setup" <<'EOF'
# Generated variable subset corresponding to spksrc.service.mk; no custom hooks.
USER=transmission
EFF_USER=sc-transmission
LOG_FILE="${SYNOPKG_PKGVAR}/${SYNOPKG_PKGNAME}.log"
PID_FILE="${SYNOPKG_PKGVAR}/${SYNOPKG_PKGNAME}.pid"
EOF
cat /repo/.lab/synocommunity-upstream/service-setup.sh >> "$pkg/scripts/service-setup"
printf 'vendor-ui-preserved\n' > /usr/local/share/transmission/public_html/index.html
if [ ! -f "$pkg/var/settings.json" ]; then
  printf '%s\n' '{"rpc-enabled":true,"rpc-bind-address":"0.0.0.0","rpc-port":9091,"rpc-authentication-required":false,"rpc-whitelist-enabled":false,"rpc-host-whitelist-enabled":false,"download-dir":"/data","dht-enabled":false,"pex-enabled":false,"lpd-enabled":false,"port-forwarding-enabled":false}' > "$pkg/var/settings.json"
  chown 12345:12345 "$pkg/var/settings.json"
fi
/test-tools/busybox --install -s /tmp/busybox-bin
