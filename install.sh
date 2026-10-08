#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="global"
WORKSPACE_DIR=""

usage() {
  cat <<'EOF'
Usage:
  ./install.sh                         Install globally (default)
  ./install.sh --global                Install globally
  ./install.sh --workspace /path       Install for one Antigravity workspace

The installer preserves an existing config.env and backs up an existing plugin.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --global) MODE="global"; shift ;;
    --workspace) [[ $# -ge 2 ]] || { usage >&2; exit 2; }; MODE="workspace"; WORKSPACE_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || true)"
if [[ -z "$NODE_MAJOR" || "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

if [[ "$MODE" == "global" ]]; then
  TARGET_DIR="${HOME}/.gemini/config/plugins/tencentdb-memory-antigravity"
else
  if [[ -z "$WORKSPACE_DIR" ]]; then
    echo "--workspace requires a directory." >&2
    exit 2
  fi
  WORKSPACE_DIR="$(cd "$WORKSPACE_DIR" && pwd)"
  TARGET_DIR="${WORKSPACE_DIR}/.agents/plugins/tencentdb-memory-antigravity"
fi

if [[ "$SOURCE_DIR" == "$TARGET_DIR" ]]; then
  echo "Already in the installation directory; refusing to overwrite itself." >&2
  exit 2
fi

PRESERVED_CONFIG=""
trap '[[ -z "$PRESERVED_CONFIG" ]] || rm -f "$PRESERVED_CONFIG"' EXIT
if [[ -f "$TARGET_DIR/config.env" ]]; then
  PRESERVED_CONFIG="$(mktemp)"
  cp "$TARGET_DIR/config.env" "$PRESERVED_CONFIG"
fi

if [[ -e "$TARGET_DIR" ]]; then
  BACKUP_ROOT="$(dirname "$(dirname "$TARGET_DIR")")/plugin-backups"
  mkdir -p "$BACKUP_ROOT"
  chmod 700 "$BACKUP_ROOT"
  BACKUP_DIR="${BACKUP_ROOT}/tencentdb-memory-antigravity-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mv "$TARGET_DIR" "$BACKUP_DIR"
  echo "Previous installation moved to: $BACKUP_DIR"
fi

mkdir -p "$TARGET_DIR"
for item in plugin.json package.json LICENSE README.md config.env.example hooks.json.template mcp_config.json.template scripts docs; do
  cp -R "$SOURCE_DIR/$item" "$TARGET_DIR/"
done

if [[ -n "$PRESERVED_CONFIG" ]]; then
  mv "$PRESERVED_CONFIG" "$TARGET_DIR/config.env"
else
  cp "$TARGET_DIR/config.env.example" "$TARGET_DIR/config.env"
fi

chmod 700 "$TARGET_DIR/scripts" "$TARGET_DIR/scripts/"*.mjs
chmod 600 "$TARGET_DIR/config.env"
node "$TARGET_DIR/scripts/render-config.mjs" "$TARGET_DIR"

echo
echo "Installed TencentDB Memory plugin at: $TARGET_DIR"
echo "Next steps:"
echo "  1. Edit: $TARGET_DIR/config.env"
echo "  2. Test: node $TARGET_DIR/scripts/doctor.mjs"
echo "  3. Restart Antigravity and verify the TencentDB hooks/MCP server."
