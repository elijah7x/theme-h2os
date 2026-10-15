#!/bin/bash
# usage: launch.sh <name> <cdp-port> <absolute-path-to-theme-dir> [light|dark]
# Starts a SEPARATE Obsidian instance (own profile + own scratch vault) with CDP enabled.
# The theme dir must contain theme.css + manifest.json; it is symlinked, so edits show after reload.
set -e
NAME=$1; PORT=$2; THEME_DIR=$3; MODE=${4:-light}
BASE=/tmp/h2os-harness/$NAME
[ -f "$BASE/pid" ] && kill "$(cat "$BASE/pid")" 2>/dev/null || true
rm -rf "$BASE"; mkdir -p "$BASE/profile"
cp -R /tmp/h2os-harness/template-vault "$BASE/vault"
mkdir -p "$BASE/vault/.obsidian/themes"
ln -s "$THEME_DIR" "$BASE/vault/.obsidian/themes/H2 OS"
[ "$MODE" = dark ] && sed -i '' 's/moonstone/obsidian/' "$BASE/vault/.obsidian/appearance.json"
echo "{\"vaults\":{\"h2os$NAME\":{\"path\":\"$BASE/vault\",\"ts\":$(date +%s)000,\"open\":true}}}" > "$BASE/profile/obsidian.json"
nohup /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$BASE/profile" --remote-debugging-port=$PORT > "$BASE/obsidian.log" 2>&1 &
echo $! > "$BASE/pid"
echo "started pid $(cat $BASE/pid), vault $BASE/vault, CDP http://127.0.0.1:$PORT/json"
