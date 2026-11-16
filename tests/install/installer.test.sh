#!/bin/sh
set -eu
repo=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/twui-install-test.XXXXXXXX")
trap 'rm -rf "$work"' EXIT
installer=$repo/release/install.sh
make_release() {
  version=$1
  mkdir -p "$work/source-$version/web" "$work/source-$version/docs"
  printf '<html>%s</html>\n' "$version" > "$work/source-$version/web/index.html"
  printf '%s\n' "$version" > "$work/source-$version/VERSION"
  printf 'Offline deployment instructions\n' > "$work/source-$version/docs/deployment.md"
  (cd "$work/source-$version" && sha256sum VERSION web/index.html docs/deployment.md > SHA256SUMS && tar -czf "$work/$version.tar.gz" VERSION SHA256SUMS web docs)
}
reject() { if sh "$installer" "$@" > "$work/rejected.log" 2>&1; then printf 'Expected failure: %s\n' "$*" >&2; exit 1; fi; }
make_release 1.0.0; make_release 2.0.0
prefix=$work/volume2/shared/web-ui
sh "$installer" --prefix "$prefix" --check
sh "$installer" --prefix "$prefix" --archive "$work/1.0.0.tar.gz"
[ "$(readlink "$prefix/current")" = releases/1.0.0/web ]
[ -r "$prefix/releases/1.0.0/docs/deployment.md" ]
sh "$installer" --prefix "$prefix" --archive "$work/2.0.0.tar.gz"
[ "$(readlink "$prefix/current")" = releases/2.0.0/web ]
[ "$(readlink "$prefix/previous")" = releases/1.0.0/web ]
sh "$installer" --prefix "$prefix" --rollback 1.0.0
[ "$(readlink "$prefix/current")" = releases/1.0.0/web ]
reject --prefix /; reject --prefix ''; reject --prefix /volume2
mkdir "$work/unmanaged"; printf 'original\n' > "$work/unmanaged/index.html"
reject --prefix "$work/unmanaged" --archive "$work/2.0.0.tar.gz"
[ "$(cat "$work/unmanaged/index.html")" = original ]
printf 'corrupt\n' > "$work/source-2.0.0/web/index.html"
(cd "$work/source-2.0.0" && tar -czf "$work/corrupt.tar.gz" VERSION SHA256SUMS web)
reject --prefix "$prefix" --archive "$work/corrupt.tar.gz"
[ "$(readlink "$prefix/current")" = releases/1.0.0/web ]
ln -s /etc/passwd "$work/source-2.0.0/web/link"
(cd "$work/source-2.0.0" && tar -czf "$work/link.tar.gz" VERSION SHA256SUMS web)
reject --prefix "$prefix" --archive "$work/link.tar.gz"
ln -s "$work/source-2.0.0" "$prefix/releases/3.0.0"
reject --prefix "$prefix" --rollback 3.0.0
rm "$prefix/releases/3.0.0"
printf 'registered XDG adapter\n' > "$prefix/.synocommunity-xdg"
reject --prefix "$prefix" --uninstall
[ -r "$prefix/current/index.html" ]
rm "$prefix/.synocommunity-xdg"
sh "$installer" --prefix "$prefix" --uninstall
[ ! -e "$prefix/current" ]; [ -f "$work/unmanaged/index.html" ]
printf 'Installer regression scenarios passed\n'
# Explicit CLI prefix wins over the environment; checks never need stdin.
TWUI_PREFIX=/ sh "$installer" --prefix "$work/explicit" --check < /dev/null
mkdir "$prefix/.install-lock"
reject --prefix "$prefix" --archive "$work/2.0.0.tar.gz"
rmdir "$prefix/.install-lock"
mkdir "$prefix/.install-lock"
printf '99999999\n' > "$prefix/.install-lock/pid"
printf '0\n' > "$prefix/.install-lock/start"
sh "$installer" --prefix "$prefix" --archive "$work/1.0.0.tar.gz"
[ ! -d "$prefix/.install-lock" ]
# A renamed archive does not change its internal VERSION semantics.
cp "$work/1.0.0.tar.gz" "$work/v1.0.0-renamed.tar.gz"
sh "$installer" --prefix "$work/version-prefix" --archive "$work/v1.0.0-renamed.tar.gz" < /dev/null
[ "$(readlink "$work/version-prefix/current")" = releases/1.0.0/web ]
# An extra file without a checksum must be rejected before activation.
rm -f "$work/source-2.0.0/web/link"
printf 'extra\n' > "$work/source-2.0.0/web/unchecked.txt"
(cd "$work/source-2.0.0" && sha256sum VERSION web/index.html > SHA256SUMS && tar -czf "$work/unchecked.tar.gz" VERSION SHA256SUMS web)
reject --prefix "$work/version-prefix" --archive "$work/unchecked.tar.gz"
[ "$(readlink "$work/version-prefix/current")" = releases/1.0.0/web ]
# An unrelated entry inside releases prevents destructive uninstall.
mkdir "$work/version-prefix/releases/unmanaged"
reject --prefix "$work/version-prefix" --uninstall
[ -r "$work/version-prefix/current/index.html" ]
printf 'Installer failure-injection scenarios passed\n'
# Release wrappers may use ./ entries and include checksummed review documents.
mkdir -p "$work/source-normalized/web" "$work/source-normalized/docs/evidence"
printf 'normalized\n' > "$work/source-normalized/web/index.html"
printf '3.0.0\n' > "$work/source-normalized/VERSION"
printf '{}\n' > "$work/source-normalized/docs/evidence/check.json"
printf '#!/bin/sh\nexit 0\n' > "$work/source-normalized/install-tr-control.sh"
cp "$work/source-normalized/install-tr-control.sh" "$work/source-normalized/install-transmission-web-ui.sh"
(cd "$work/source-normalized" && find . -type f ! -name SHA256SUMS | sed 's:^./::' | sort | xargs sha256sum > SHA256SUMS && tar -czf "$work/normalized.tar.gz" .)
sh "$installer" --prefix "$work/normalized-prefix" --archive "$work/normalized.tar.gz" >/dev/null
[ -r "$work/normalized-prefix/current/index.html" ]
# Canonical path aliases cannot bypass duplicate-entry rejection.
(cd "$work/source-normalized" && tar -czf "$work/alias.tar.gz" VERSION SHA256SUMS web ./web)
reject --prefix "$work/normalized-prefix" --archive "$work/alias.tar.gz"
printf 'tampered\n' >> "$work/normalized-prefix/releases/3.0.0/web/index.html"
reject --prefix "$work/normalized-prefix" --rollback 3.0.0
printf 'Normalized release, alias rejection and stored-release verification passed\n'
