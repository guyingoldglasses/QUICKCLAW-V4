#!/bin/bash
# ═══════════════════════════════════════════
#  QuickClaw V3 — Launch
#  Starts gateway + dashboard, verifies both
# ═══════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$SCRIPT_DIR/openclaw"
DASHBOARD_DIR="$SCRIPT_DIR/dashboard-files"
PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'
info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[  ok]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; }

echo ""
echo -e "${BOLD}⚡ QuickClaw V3 — Starting...${NC}"
echo ""

# ─── Pre-flight: check Node.js ───
if ! command -v node &>/dev/null; then
  fail "Node.js not found. Please install it from https://nodejs.org"
  echo ""; exit 1
fi
info "Node.js $(node -v)"

# ─── Pre-flight: check dependencies ───
if [[ ! -d "$DASHBOARD_DIR/node_modules" ]]; then
  info "Installing dashboard dependencies..."
  cd "$DASHBOARD_DIR" && npm install --omit=dev 2>&1 | tail -1
  cd "$SCRIPT_DIR"
fi

# ─── Clean stale PID files ───
for name in gateway dashboard; do
  pidfile="$PID_DIR/$name.pid"
  if [[ -f "$pidfile" ]]; then
    pid=$(cat "$pidfile" 2>/dev/null || true)
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pidfile"
    fi
  fi
done

# ─── Kill anything already on our dashboard port ───
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti tcp:$port 2>/dev/null || true)
  for p in $pids; do
    local cmd
    cmd=$(ps -p "$p" -o command= 2>/dev/null || true)
    if [[ "$cmd" == *"server.js"* || "$cmd" == *"node "* ]]; then
      kill "$p" 2>/dev/null || true
      sleep 0.5
      kill -9 "$p" 2>/dev/null || true
    fi
  done
}

# ─── Detect active profile config dir ───
# The gateway needs OPENCLAW_CONFIG_DIR / CLAWDBOT_CONFIG_DIR to read the right config
PROFILES_JSON="$SCRIPT_DIR/dashboard-data/profiles.json"
CONFIG_DIR=""
if [[ -f "$PROFILES_JSON" ]]; then
  # Try to find active profile's config dir
  ACTIVE_ID=$(node -e "try{const p=JSON.parse(require('fs').readFileSync('$PROFILES_JSON','utf8'));const a=p.find(x=>x.active)||p[0];console.log(a?a.id:'')}catch{}" 2>/dev/null)
  if [[ -n "$ACTIVE_ID" && "$ACTIVE_ID" != "default" ]]; then
    SUFFIX="-${ACTIVE_ID#p-}"
    for base in "$HOME/.openclaw$SUFFIX" "$HOME/.clawdbot$SUFFIX"; do
      [[ -d "$base" ]] && CONFIG_DIR="$base" && break
    done
  fi
fi
# Default config dirs
if [[ -z "$CONFIG_DIR" ]]; then
  for base in "$HOME/.openclaw" "$HOME/.clawdbot"; do
    [[ -d "$base" ]] && CONFIG_DIR="$base" && break
  done
fi
if [[ -n "$CONFIG_DIR" ]]; then
  export OPENCLAW_CONFIG_DIR="$CONFIG_DIR"
  export CLAWDBOT_CONFIG_DIR="$CONFIG_DIR"
  info "Config dir: $CONFIG_DIR"
fi

# ─── Start Gateway ───
GW_PID=""
if [[ -f "$PID_DIR/gateway.pid" ]] && kill -0 "$(cat "$PID_DIR/gateway.pid" 2>/dev/null)" 2>/dev/null; then
  GW_PID=$(cat "$PID_DIR/gateway.pid")
  ok "Gateway already running (PID $GW_PID)"
else
  info "Starting gateway..."
  GW_LOG="$LOG_DIR/gateway.log"
  cd "$INSTALL_DIR" 2>/dev/null || cd "$SCRIPT_DIR"

  # Ensure node is in PATH
  NODE_BIN=$(which node 2>/dev/null)
  if [[ -n "$NODE_BIN" ]]; then
    NODE_DIR=$(dirname "$NODE_BIN")
    export PATH="$NODE_DIR:$PATH"
  fi

  OPENCLAW_BIN=""
  if [[ -x "$INSTALL_DIR/node_modules/.bin/openclaw" ]]; then
    OPENCLAW_BIN="$INSTALL_DIR/node_modules/.bin/openclaw"
  fi

  # Step 1: Install the LaunchAgent (creates the plist)
  if [[ -n "$OPENCLAW_BIN" ]]; then
    "$OPENCLAW_BIN" gateway install >> "$GW_LOG" 2>&1 || true
  else
    npx openclaw gateway install >> "$GW_LOG" 2>&1 || true
  fi

  # Step 2: Patch the plist to fix node path + add config dir
  PLIST="$HOME/Library/LaunchAgents/ai.openclaw.gateway.plist"
  if [[ -f "$PLIST" && -n "$NODE_BIN" ]]; then
    # Replace /usr/bin/env + node with actual node binary path
    if grep -q '/usr/bin/env' "$PLIST" && grep -q '<string>node</string>' "$PLIST"; then
      # Use python for reliable XML-safe replacement
      python3 -c "
import re, sys
with open('$PLIST', 'r') as f: t = f.read()
t = re.sub(r'<string>/usr/bin/env</string>\s*\n\s*<string>node</string>', '<string>$NODE_BIN</string>', t)
with open('$PLIST', 'w') as f: f.write(t)
" 2>/dev/null && info "Patched plist: node=$NODE_BIN"
    fi
    # Add EnvironmentVariables if missing
    if ! grep -q 'EnvironmentVariables' "$PLIST"; then
      ENV_BLOCK="  <key>EnvironmentVariables</key>\n  <dict>\n    <key>PATH</key>\n    <string>$NODE_DIR:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>\n"
      [[ -n "$OPENCLAW_CONFIG_DIR" ]] && ENV_BLOCK+="    <key>OPENCLAW_CONFIG_DIR</key>\n    <string>$OPENCLAW_CONFIG_DIR</string>\n    <key>CLAWDBOT_CONFIG_DIR</key>\n    <string>$CLAWDBOT_CONFIG_DIR</string>\n"
      ENV_BLOCK+="  </dict>\n"
      # Insert before closing </dict></plist>
      python3 -c "
import re
with open('$PLIST', 'r') as f: t = f.read()
t = re.sub(r'</dict>\s*</plist>', '''$ENV_BLOCK</dict>\n</plist>''', t)
with open('$PLIST', 'w') as f: f.write(t)
" 2>/dev/null && info "Added env vars to plist"
    fi
  fi

  # Step 3: Start the gateway
  if [[ -n "$OPENCLAW_BIN" ]]; then
    nohup "$OPENCLAW_BIN" gateway start --allow-unconfigured >> "$GW_LOG" 2>&1 &
  else
    nohup npx openclaw gateway start --allow-unconfigured >> "$GW_LOG" 2>&1 &
  fi
  GW_PID=$!
  echo "$GW_PID" > "$PID_DIR/gateway.pid"
  sleep 2
  
  # Verify something is actually running on the gateway port
  if lsof -ti tcp:18789 >/dev/null 2>&1 || lsof -ti tcp:5000 >/dev/null 2>&1; then
    ok "Gateway started and listening"
  elif kill -0 "$GW_PID" 2>/dev/null; then
    ok "Gateway process started (PID $GW_PID) — may take a moment to become ready"
  else
    warn "Gateway may not have started — check $GW_LOG"
    GW_PID="none"
  fi
fi

# ─── Dashboard port ───
DB_PORT=3000
EXISTING=$(lsof -ti tcp:$DB_PORT 2>/dev/null | head -n1 || true)
if [[ -n "$EXISTING" ]]; then
  CMD=$(ps -p "$EXISTING" -o command= 2>/dev/null || true)
  if [[ "$CMD" == *"server.js"* ]]; then
    info "Stopping old dashboard on :$DB_PORT..."
    kill_port $DB_PORT
    sleep 1
  else
    for p in 3001 3002 3003 3004 3005; do
      if [[ -z "$(lsof -ti tcp:$p 2>/dev/null || true)" ]]; then
        DB_PORT=$p; warn "Port 3000 in use. Using :$DB_PORT"; break
      fi
    done
  fi
fi

# Also clean the PID file
rm -f "$PID_DIR/dashboard.pid"

# ─── Start Dashboard ───
info "Starting dashboard on port $DB_PORT..."
cd "$DASHBOARD_DIR"
DB_LOG="$LOG_DIR/dashboard.log"
echo "--- Dashboard start: $(date) ---" >> "$DB_LOG"

QUICKCLAW_ROOT="$SCRIPT_DIR" DASHBOARD_PORT="$DB_PORT" nohup node server.js >> "$DB_LOG" 2>&1 &
DASH_PID=$!
echo "$DASH_PID" > "$PID_DIR/dashboard.pid"

# ─── Health check ───
info "Waiting for dashboard..."
HEALTHY=false
for i in $(seq 1 8); do
  sleep 1
  if ! kill -0 "$DASH_PID" 2>/dev/null; then
    echo ""
    fail "Dashboard crashed on startup!"
    echo ""
    echo -e "${YELLOW}─── Last 25 lines of dashboard.log ───${NC}"
    tail -25 "$DB_LOG" 2>/dev/null
    echo -e "${YELLOW}───────────────────────────────────────${NC}"
    echo ""
    fail "Fix the error above, then re-run this script."
    echo ""
    exit 1
  fi
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$DB_PORT/api/ping" 2>/dev/null || true)
  if [[ "$HTTP" == "200" ]]; then
    HEALTHY=true
    break
  fi
done

if $HEALTHY; then
  ok "Dashboard is live! (PID $DASH_PID)"
else
  warn "Dashboard process running but not responding yet."
  warn "It may still be loading. Check: $DB_LOG"
fi

# ─── Summary ───
echo ""
echo -e "${BOLD}═══════════════════════════════════════${NC}"
echo -e "  ${GREEN}⚡ QuickClaw V3 is ready${NC}"
echo -e "${BOLD}═══════════════════════════════════════${NC}"
echo ""
echo -e "  Gateway   : ${CYAN}http://localhost:5000${NC}  (PID ${GW_PID:-?})"
echo -e "  Dashboard : ${CYAN}http://localhost:$DB_PORT${NC}  (PID $DASH_PID)"
echo -e "  Logs      : $LOG_DIR"
echo ""

if $HEALTHY; then
  open "http://localhost:$DB_PORT" 2>/dev/null || true
fi
