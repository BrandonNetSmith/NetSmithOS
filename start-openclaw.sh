#!/bin/bash
# start-openclaw.sh — Load .env and start OpenClaw gateway
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Missing .env file: $ENV_FILE"
  echo "   Copy .env.example to .env and fill in your keys."
  exit 1
fi

# Load env vars
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

# Validate required keys
MISSING=()
[[ -z "${ANTHROPIC_API_KEY:-}" || "$ANTHROPIC_API_KEY" == "sk-ant-" ]] && MISSING+=("ANTHROPIC_API_KEY")
[[ -z "${DISCORD_BOT_TOKEN:-}" ]] && MISSING+=("DISCORD_BOT_TOKEN")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "⚠️  Warning: missing or incomplete env vars: ${MISSING[*]}"
  echo "   OpenClaw will start but some channels may be offline."
fi

# Sync config to ~/.openclaw/openclaw.json
OPENCLAW_DIR="$HOME/.openclaw"
mkdir -p "$OPENCLAW_DIR"
cp "$SCRIPT_DIR/config/openclaw.json" "$OPENCLAW_DIR/openclaw.json"
echo "✅ Config synced to $OPENCLAW_DIR/openclaw.json"

echo "🦞 Starting OpenClaw gateway..."
echo "   Mode: local | Port: 18789"
echo "   Channels: Discord, Slack, Signal"
echo ""

exec openclaw gateway start
