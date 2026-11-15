#!/bin/sh
# Includes WebKit runtime libraries without changing the development host.
set -eu
repo=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
image=mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579
docker run --rm --network host --ipc host --user "$(id -u):$(id -g)" -e TWUI_REPORT_DIR -e TWUI_PREVIEW_DIR -e TWUI_PREVIEW_PORT -e TWUI_PROXY -e TWUI_SOAK -e TWUI_SOAK_SECONDS -e TWUI_REAL_SCALE -e npm_config_cache=/tmp/twui-npm-cache -v "$repo:$repo:z" -w "$repo" "$image" npx playwright test "$@"
