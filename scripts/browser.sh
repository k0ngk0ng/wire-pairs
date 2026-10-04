#!/bin/sh
# Keep task-owned browser state, profiles, caches and screenshots inside this workspace.
set -eu
cd "$(dirname "$0")/.."
mkdir -p .work/ab .work/chrome .work/tmp .work/cache .work/screenshots
export AGENT_BROWSER_SOCKET_DIR="$PWD/.work/ab"
export AGENT_BROWSER_SESSION="wire-pairs"
export AGENT_BROWSER_PROFILE="$PWD/.work/chrome"
export AGENT_BROWSER_SCREENSHOT_DIR="$PWD/.work/screenshots"
export AGENT_BROWSER_DOWNLOAD_PATH="$PWD/.work/downloads"
export XDG_CACHE_HOME="$PWD/.work/cache"
export TMPDIR="$PWD/.work/tmp"
exec agent-browser "$@"
