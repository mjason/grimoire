#!/usr/bin/env bash
# Verify grimoire runs terminal-free on Linux: `start` detaches and survives the
# launching CLI, status/healthz work, and `stop` shuts it down cleanly.
#
# Usage:
#   scripts/verify-daemon.sh
#   GRIMOIRE_BIN=./release/grimoire-linux-x64 GRIMOIRE_PORT=8799 scripts/verify-daemon.sh
#
# Exits 0 if every check passes, non-zero otherwise.
set -uo pipefail
cd "$(dirname "$0")/.."

ROOT="${GRIMOIRE_ROOT:-$(pwd)}"
PORT="${GRIMOIRE_PORT:-8799}"
URL="http://localhost:${PORT}"

# Prefer the compiled binary; fall back to source mode.
if [ -n "${GRIMOIRE_BIN:-}" ]; then
  RUN=("$GRIMOIRE_BIN")
elif [ -x "release/grimoire-linux-x64" ]; then
  RUN=("./release/grimoire-linux-x64")
else
  RUN=(bun run src/serve.ts)
fi

pass=0; fail=0
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
no() { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); }
hr() { printf '\033[2m%s\033[0m\n' "────────────────────────────────────────"; }

# Best-effort cleanup if we bail out mid-run.
trap '"${RUN[@]}" stop --root "$ROOT" >/dev/null 2>&1 || true' EXIT

printf '▶ runner : %s\n▶ root   : %s\n▶ port   : %s\n\n' "${RUN[*]}" "$ROOT" "$PORT"

# Fresh slate.
"${RUN[@]}" stop --root "$ROOT" >/dev/null 2>&1 || true
rm -rf "$ROOT/.grimoire"

hr; echo "1) start — the CLI must RETURN (not hold the terminal)"
# Run inside a subshell that then exits, mimicking a terminal you launch from
# and close. `start` blocks only until the server is healthy, then returns.
t0=$(date +%s%N)
( "${RUN[@]}" start --root "$ROOT" --port "$PORT" ) 2>&1
rc=$?
t1=$(date +%s%N)
if [ $rc -eq 0 ]; then ok "start returned (exit 0) in $(( (t1-t0)/1000000 ))ms — subshell exited, terminal free"
else no "start exited with code $rc"; fi

STATE="$ROOT/.grimoire/daemon.json"
if [ ! -f "$STATE" ]; then
  no "no daemon.json written — cannot continue"
  echo "--- daemon.log ---"; tail -20 "$ROOT/.grimoire/daemon.log" 2>/dev/null
  echo; hr; printf 'PASS %d  FAIL %d\n' "$pass" "$fail"; exit 1
fi
PID=$(grep -oE '"pid":[0-9]+' "$STATE" | grep -oE '[0-9]+')

echo
hr; echo "2) the server is a live, independent process (pid ${PID})"
if kill -0 "$PID" 2>/dev/null; then ok "pid $PID alive AFTER the launching subshell exited"
else no "pid $PID not alive"; fi
SPPID=$(ps -o ppid= -p "$PID" 2>/dev/null | tr -d ' ')
if [ "${SPPID:-0}" = "1" ]; then ok "parent pid = 1 (init) → fully detached; closing the terminal can't SIGHUP it"
else printf '  \033[33m•\033[0m parent pid = %s (not reparented to init yet — still detached via its own session)\n' "${SPPID:-?}"; fi

echo
hr; echo "3) status"
"${RUN[@]}" status --root "$ROOT"

echo
hr; echo "4) healthz"
if curl -fs -m 3 "$URL/healthz" >/dev/null; then ok "$URL/healthz responds ok"
else no "$URL/healthz did not respond"; fi

echo
hr; echo "5) stop — graceful shutdown + state cleanup"
"${RUN[@]}" stop --root "$ROOT"
sleep 0.4
if kill -0 "$PID" 2>/dev/null; then no "pid $PID still alive after stop"; else ok "pid $PID gone"; fi
if curl -fs -m 2 "$URL/healthz" >/dev/null 2>&1; then no "healthz still responding after stop"; else ok "healthz no longer responds"; fi
if [ -f "$STATE" ]; then no "daemon.json not removed"; else ok "daemon.json removed"; fi

rm -rf "$ROOT/.grimoire"
trap - EXIT

echo
hr
printf 'PASS: \033[32m%d\033[0m   FAIL: \033[31m%d\033[0m\n' "$pass" "$fail"
if [ $fail -eq 0 ]; then printf '\033[32m✅ grimoire runs terminal-free on Linux (start/status/stop verified)\033[0m\n'; exit 0
else printf '\033[31m❌ something is off — see above\033[0m\n'; exit 1; fi
