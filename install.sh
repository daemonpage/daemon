#!/usr/bin/env bash
# Install the daemon skill into Claude Code (user scope) and init the vault.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/daemon"

command -v node >/dev/null || { echo "daemon needs Node 18+ (node not found)"; exit 1; }
command -v claude >/dev/null || echo "warning: 'claude' CLI not found — install Claude Code first (https://claude.com/claude-code)"

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -r "$HERE/skills/daemon" "$DEST"

node "$DEST/scripts/vault.mjs" init >/dev/null

echo "✓ daemon skill installed → $DEST"
echo "✓ vault initialized      → ${DAEMON_HOME:-$HOME/.daemon}"
echo
echo "Open Claude Code and say:  hatch my daemon"
echo
echo "Optional — let other Claude surfaces read your vault:"
echo "  claude mcp add daemon -- node $DEST/mcp/server.mjs"
