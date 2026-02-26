#!/bin/bash
# ═══════════════════════════════════════════
#  QuickClaw V3 — Stop
#  Cleanly stops gateway + dashboard
# ═══════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

echo ""
echo -e "${BOLD}⚡ QuickClaw V3 — Stopping...${NC}"
echo ""

stopped=0

# ─── Stop from PID files ───
for name in dashboard gateway; do
  pidfile="$PID_DIR/$name.pid"
  if [[ -f "$pidfile" ]]; then
    pid=$(cat "$pidfile" 2>/dev/null || true)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo -e "${CYAN}[info]${NC}  Stopping $name (PID $pid)..."
      kill "$pid" 2>/dev/null || true
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
        sleep 0.5
      fi
      stopped=$((stopped + 1))
    fi
    rm -f "$pidfile"
  fi
done

# ─── Kill any orphan dashboard processes on common ports ───
for port in 3000 3001 3002 3003 3004 3005; do
  pids=$(lsof -ti tcp:$port 2>/dev/null || true)
  for pid in $pids; do
    cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
    if [[ "$cmd" == *"server.js"* || "$cmd" == *"dashboard-files"* ]]; then
      echo -e "${CYAN}[info]${NC}  Killing orphan dashboard on :$port (PID $pid)"
      kill "$pid" 2>/dev/null || true
      sleep 0.5
      kill -9 "$pid" 2>/dev/null || true
      stopped=$((stopped + 1))
    fi
  done
done

# ─── Kill any orphan gateway processes ───
for port in 5000 18789; do
  pids=$(lsof -ti tcp:$port 2>/dev/null || true)
  for pid in $pids; do
    cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
    if [[ "$cmd" == *"openclaw"* || "$cmd" == *"gateway"* ]]; then
      echo -e "${CYAN}[info]${NC}  Killing orphan gateway on :$port (PID $pid)"
      kill "$pid" 2>/dev/null || true
      sleep 0.5
      kill -9 "$pid" 2>/dev/null || true
      stopped=$((stopped + 1))
    fi
  done
done

if [[ $stopped -eq 0 ]]; then
  echo -e "${GREEN}[  ok]${NC}  Nothing was running."
else
  echo ""
  echo -e "${GREEN}[  ok]${NC}  Stopped $stopped process(es)."
fi
echo ""
