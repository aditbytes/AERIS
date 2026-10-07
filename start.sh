#!/usr/bin/env bash
# ==============================================================================
# AERIS — AI Environmental Risk & Intervention System
# Startup Script for Local Development, Review, and Demo
# Track 01: Air | WeMakeDevs x AWS Environmental Hacks '26
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
WEB_DIR="$REPO_ROOT/web"
DATA_LIVE="$REPO_ROOT/data/live"
WEB_DATA="$WEB_DIR/public/data"

# Styling & colors
BOLD='\033[1m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
NC='\033[0m' # No Color

# Defaults
MODE="dev"
PORT=""
HOST="127.0.0.1"
RUN_AGENT=false
RUN_TESTS=false
TESTS_ONLY=false
DO_BUILD=false
OPEN_BROWSER=false

print_banner() {
  echo -e "${CYAN}${BOLD}"
  echo "  ╔═══════════════════════════════════════════════════════════════╗"
  echo "  ║      AERIS — AI Environmental Risk & Intervention System      ║"
  echo "  ║   Source → Plume → Exposure → Action (Bharat Builds 2026)     ║"
  echo "  ╚═══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

show_help() {
  print_banner
  cat << EOF
Usage: ./start.sh [OPTIONS]

Options:
  -d, --dev         Start Vite development server with hot-reload (default, port 5173)
  -p, --preview     Serve production build from web/dist (port 4173)
  -b, --build       Build web application (npm run build)
  -a, --agent       Run Strands Action Agent live generation before starting UI
  -t, --test        Run agent unit tests (agent/tests/test_agent.py)
      --test-only   Run agent unit tests and exit immediately
  -o, --open        Automatically open browser on server startup
      --port <PORT> Specify custom port for web server
      --host <HOST> Specify custom host binding (default: 127.0.0.1)
  -h, --help        Show this help message and exit

Examples:
  ./start.sh                  # Start Vite dev server on http://127.0.0.1:5173
  ./start.sh --preview        # Serve production build on http://127.0.0.1:4173
  ./start.sh --agent --dev    # Regenerate action plan via Agent, then start dev server
  ./start.sh --test-only      # Run Python unit tests and exit
EOF
}

# Parse command line flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--dev)
      MODE="dev"
      shift
      ;;
    -p|--preview)
      MODE="preview"
      shift
      ;;
    -b|--build)
      DO_BUILD=true
      shift
      ;;
    -a|--agent)
      RUN_AGENT=true
      shift
      ;;
    -t|--test)
      RUN_TESTS=true
      shift
      ;;
    --test-only)
      RUN_TESTS=true
      TESTS_ONLY=true
      shift
      ;;
    -o|--open)
      OPEN_BROWSER=true
      shift
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --host)
      HOST="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo -e "${RED}[ERROR] Unknown option: $1${NC}"
      echo "Use './start.sh --help' to view available options."
      exit 1
      ;;
  esac
done

print_banner

# ------------------------------------------------------------------------------
# 1. Environment & Dependency Checks
# ------------------------------------------------------------------------------
echo -e "${CYAN}[1/5] Checking environment dependencies...${NC}"

if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Node.js is not installed or not in PATH.${NC}"
  echo "Please install Node.js (v18+ recommended) from https://nodejs.org"
  exit 1
fi
NODE_VER=$(node -v)
echo -e "  ✔ Node.js: ${GREEN}${NODE_VER}${NC}"

if ! command -v npm >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] npm is not installed or not in PATH.${NC}"
  exit 1
fi
NPM_VER=$(npm -v)
echo -e "  ✔ npm:     ${GREEN}v${NPM_VER}${NC}"

PYTHON_CMD=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD="python"
fi

if [[ -n "$PYTHON_CMD" ]]; then
  PY_VER=$($PYTHON_CMD -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")')
  echo -e "  ✔ Python:  ${GREEN}v${PY_VER}${NC} (${PYTHON_CMD})"
else
  echo -e "  ${YELLOW}⚠ Python 3 not found in PATH (agent live runs will be disabled)${NC}"
fi

# ------------------------------------------------------------------------------
# 2. Run Tests if requested
# ------------------------------------------------------------------------------
if [[ "$RUN_TESTS" = true ]]; then
  echo -e "\n${CYAN}[2/5] Running Agent Unit Tests...${NC}"
  if [[ -z "$PYTHON_CMD" ]]; then
    echo -e "${RED}[ERROR] Cannot run tests: Python not found.${NC}"
    exit 1
  fi
  (cd "$REPO_ROOT" && $PYTHON_CMD -m unittest agent/tests/test_agent.py)
  echo -e "${GREEN}  ✔ All unit tests passed successfully.${NC}"

  if [[ "$TESTS_ONLY" = true ]]; then
    echo -e "\n${GREEN}[SUCCESS] Test suite completed. Exiting as requested.${NC}"
    exit 0
  fi
else
  echo -e "\n${CYAN}[2/5] Skipping tests (pass --test to run).${NC}"
fi

# ------------------------------------------------------------------------------
# 3. Synchronize Real Data Snapshots
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[3/5] Verifying real data snapshots...${NC}"
mkdir -p "$WEB_DATA"

SNAPSHOTS=("sources.json" "corridor.geojson" "ranked_sites.json" "actions.json" "aqi.json" "wind.json")
for file in "${SNAPSHOTS[@]}"; do
  SRC="$DATA_LIVE/$file"
  DST="$WEB_DATA/$file"
  if [[ -f "$SRC" ]]; then
    if [[ ! -f "$DST" || "$SRC" -nt "$DST" ]]; then
      cp "$SRC" "$DST"
      echo -e "  ✔ Synced ${GREEN}$file${NC} to web/public/data/"
    else
      echo -e "  ✔ Verified ${GREEN}$file${NC}"
    fi
  else
    echo -e "  ${YELLOW}⚠ Warning: Real snapshot $SRC not found.${NC}"
  fi
done

# Optional: Run live agent if requested
if [[ "$RUN_AGENT" = true ]]; then
  echo -e "\n${CYAN}[Agent] Generating live action plan via Strands Action Agent...${NC}"
  if [[ -z "$PYTHON_CMD" ]]; then
    echo -e "${RED}[ERROR] Python is required to run the agent.${NC}"
    exit 1
  fi
  (cd "$REPO_ROOT" && $PYTHON_CMD -m agent.agent --live)
  echo -e "${GREEN}  ✔ Action plan generated and mirrored to web/public/data/actions.json${NC}"
fi

# ------------------------------------------------------------------------------
# 4. Prepare Web Application
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[4/5] Preparing web application...${NC}"

if [[ ! -d "$WEB_DIR/node_modules" ]]; then
  echo -e "  ${YELLOW}Dependencies missing. Running npm install in web/...${NC}"
  (cd "$WEB_DIR" && npm install)
  echo -e "  ✔ Node dependencies installed."
else
  echo -e "  ✔ Node dependencies found."
fi

if [[ "$DO_BUILD" = true || ( "$MODE" = "preview" && ! -d "$WEB_DIR/dist" ) ]]; then
  echo -e "  Building production bundle (npm run build)..."
  (cd "$WEB_DIR" && npm run build)
  echo -e "  ✔ Production build complete in web/dist/."
fi

# ------------------------------------------------------------------------------
# 5. Launch Web Server
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[5/5] Launching AERIS Dashboard...${NC}"

EXTRA_FLAGS=()
if [[ -n "$HOST" ]]; then
  EXTRA_FLAGS+=(--host "$HOST")
fi
if [[ "$OPEN_BROWSER" = true ]]; then
  EXTRA_FLAGS+=(--open)
fi

cd "$WEB_DIR"

if [[ "$MODE" = "preview" ]]; then
  TARGET_PORT="${PORT:-4173}"
  EXTRA_FLAGS+=(--port "$TARGET_PORT")
  echo -e "  Mode:    ${BOLD}Production Preview${NC}"
  echo -e "  URL:     ${GREEN}${BOLD}http://${HOST}:${TARGET_PORT}/${NC}"
  echo -e "  Bundle:  ${WEB_DIR}/dist"
  echo -e "\n${BOLD}Press [Ctrl+C] to stop the server.${NC}\n"
  exec npm run preview -- "${EXTRA_FLAGS[@]}"
else
  TARGET_PORT="${PORT:-5173}"
  EXTRA_FLAGS+=(--port "$TARGET_PORT")
  echo -e "  Mode:    ${BOLD}Development (Hot Reload)${NC}"
  echo -e "  URL:     ${GREEN}${BOLD}http://${HOST}:${TARGET_PORT}/${NC}"
  echo -e "  Note:    For production preview, run with: ${CYAN}./start.sh --preview${NC}"
  echo -e "\n${BOLD}Press [Ctrl+C] to stop the server.${NC}\n"
  exec npm run dev -- "${EXTRA_FLAGS[@]}"
fi
