#!/usr/bin/env bash
# One-shot verification of a PUBLISHED grimoire release: downloads the latest
# binary from GitHub and checks it runs terminal-free — `start` detaches and
# survives the launcher, `status`/`healthz` work, `stop` shuts down cleanly.
# Nothing is installed; everything lives in a temp dir and is removed on exit.
#
# Run straight from GitHub:
#   curl -fsSL https://raw.githubusercontent.com/mjason/grimoire/main/scripts/verify-release.sh | bash
#
# Optional overrides:  GRIMOIRE_PORT=9001   GRIMOIRE_REF=v0.6.5
set -uo pipefail

REPO="mjason/grimoire"
PORT="${GRIMOIRE_PORT:-8799}"
REF="${GRIMOIRE_REF:-latest}"     # "latest" or a tag like v0.6.5
URL="http://localhost:${PORT}"

# Pick the release asset for this OS/arch.
os=$(uname -s); arch=$(uname -m)
case "$os/$arch" in
  Linux/x86_64)               asset=grimoire-linux-x64 ;;
  Linux/aarch64|Linux/arm64)  asset=grimoire-linux-arm64 ;;
  Darwin/arm64)               asset=grimoire-darwin-arm64 ;;
  Darwin/x86_64)              asset=grimoire-darwin-x64 ;;
  *) echo "unsupported platform: $os/$arch"; exit 2 ;;
esac

TMP=$(mktemp -d)
BIN="$TMP/grimoire"
ROOT="$TMP/notes"; mkdir -p "$ROOT"

pass=0; fail=0
ok(){ printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
no(){ printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); }

# Best-effort teardown no matter how we exit.
trap '[ -x "$BIN" ] && "$BIN" stop --root "$ROOT" >/dev/null 2>&1; rm -rf "$TMP"' EXIT

if [ "$REF" = "latest" ]; then
  dl="https://github.com/$REPO/releases/latest/download/$asset"
else
  dl="https://github.com/$REPO/releases/download/$REF/$asset"
fi

echo "▶ repo   : $REPO ($REF)"
echo "▶ asset  : $asset  ($os/$arch)"
echo "▶ port   : $PORT"
echo
echo "0) download from GitHub"
if curl -fSL --retry 3 -o "$BIN" "$dl" 2>/dev/null; then
  chmod +x "$BIN"; ok "downloaded $(du -h "$BIN" | cut -f1) — $dl"
else
  no "download failed: $dl"; exit 1
fi
# Version from the release tag (never probe the binary: unknown flags start a server).
tag=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/$([ "$REF" = latest ] && echo latest || echo tags/$REF)" 2>/dev/null \
  | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
[ -n "${tag:-}" ] && echo "     release: $tag"

echo
echo "1) start — the CLI must RETURN (not hold the terminal)"
t0=$(date +%s%N)
( "$BIN" start --root "$ROOT" --port "$PORT" ) 2>&1     # subshell exits after start returns
rc=$?; t1=$(date +%s%N)
[ $rc -eq 0 ] && ok "start returned (exit 0) in $(( (t1-t0)/1000000 ))ms — launcher gone, terminal free" \
             || no "start exited with code $rc"

STATE="$ROOT/.grimoire/daemon.json"
if [ ! -f "$STATE" ]; then
  no "no daemon.json written"; echo "--- daemon.log ---"; tail -20 "$ROOT/.grimoire/daemon.log" 2>/dev/null
  echo; printf 'PASS %d  FAIL %d\n' "$pass" "$fail"; exit 1
fi
PID=$(grep -oE '"pid":[0-9]+' "$STATE" | grep -oE '[0-9]+')

echo
echo "2) the server is a live, independent process (pid ${PID})"
kill -0 "$PID" 2>/dev/null && ok "pid $PID alive AFTER the launching subshell exited" || no "pid $PID not alive"
sppid=$(ps -o ppid= -p "$PID" 2>/dev/null | tr -d ' ')
[ "${sppid:-0}" = "1" ] && ok "reparented to init (ppid 1) — closing the terminal can't SIGHUP it" \
                        || printf '  \033[33m•\033[0m parent pid = %s (detached via its own session)\n' "${sppid:-?}"

echo
echo "3) status"; "$BIN" status --root "$ROOT"
echo
echo "4) healthz"
curl -fs -m 3 "$URL/healthz" >/dev/null && ok "$URL/healthz responds ok" || no "healthz did not respond"

echo
echo "5) stop — graceful shutdown + state cleanup"
"$BIN" stop --root "$ROOT"; sleep 0.4
kill -0 "$PID" 2>/dev/null && no "pid $PID still alive after stop" || ok "pid $PID gone"
curl -fs -m 2 "$URL/healthz" >/dev/null 2>&1 && no "healthz still responding" || ok "healthz no longer responds"
[ -f "$STATE" ] && no "daemon.json not removed" || ok "daemon.json removed"

echo
printf 'PASS: \033[32m%d\033[0m   FAIL: \033[31m%d\033[0m\n' "$pass" "$fail"
if [ $fail -eq 0 ]; then printf '\033[32m✅ published %s binary runs terminal-free on %s\033[0m\n' "$asset" "$os"; exit 0
else printf '\033[31m❌ something is off — see above\033[0m\n'; exit 1; fi
