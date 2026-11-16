#!/bin/sh
set -eu
repo=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
cd "$repo"
test -f artifacts/installer-2.0.0-installer.5/install-transmission-web-ui.sh
docker build -f lab/Dockerfile.login-installer-test -t twui-lab/login-installer-test:local .
docker run --rm --init --network none --entrypoint python3 \
  -v "$repo:/repo:ro,z" twui-lab/login-installer-test:local /repo/tests/install/login-integrated.py
