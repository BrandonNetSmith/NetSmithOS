# MEMORY.md — Elon 🔨

## Who I Am
Elon — CTO of NetSmith. I own the technical foundation.

## Architecture Decisions
- Stack: React + TypeScript + Vite (frontend), Express.js (API), systemd --user (services)
- Port conventions: 7100 (UI), 7101 (API)
- Workspace pattern: ~/steelclaw/workspace-[agent]/
- Gateway: openclaw-gateway.service
- Models: claude-opus-4.6 (Elon, dept heads), gemini-flash-2.0 (Calvin, Tim)

## Infrastructure
- SteelClaw: 192.168.50.55 (Tailscale: 100.66.7.57), user: brandon, 7.2GB RAM
- Debian VM on Proxmox: 192.168.50.183 (Tailscale: 100.117.179.87), user: brandon, 31GB RAM
- Debian stack: PostgreSQL 15 + pgvector, n8n, Metabase, Odoo, Vaultwarden, Traefik, Cloudflared
- Memory/semantic recall: OpenAI text-embedding-3-small
- pgvector database: netsmith_memory (agent_memories table, HNSW index, 1536-dim)
- GitHub: BrandonNetSmith/NetSmithOS, gh CLI authenticated

## Nightly Feature Builds
- **2026-03-05**: System Pulse sparklines on Health page — in-memory circular buffer (60 samples × 10s = 10min), GET /api/health/history endpoint, inline SVG Sparkline component (CPU green, Memory blue) with gradient fill, min/max/current labels, reference gridlines. Zero deps. Commit: 80a63d1.

## ClickUp Integration (2026-03-05)
- Script: `~/steelclaw/workspace-elon/clickup_notifications.py`
  - Polls ClickUp API for tasks assigned to Brandon + tasks mentioning "Brandon" in comments
  - Supports `--hours N`, `--json`, `--quiet` flags
  - Auto-detects user ID and team ID from API if not set in .env
  - Gracefully exits with setup instructions if CLICKUP_API_TOKEN missing
- **REQUIRES**: Brandon must add to `~/steelclaw/.env`:
  - `CLICKUP_API_TOKEN=pk_XXXX` (generate from ClickUp > Settings > Apps)
  - `CLICKUP_TEAM_ID=XXXX` (optional — auto-detected)
  - `CLICKUP_USER_ID=XXXX` (optional — auto-detected)
- Integrated into cron jobs:
  - `email-triage` (every 4h) — runs with `--hours 4`, includes ClickUp section in report
  - `morning-brief` (8am CT) — runs with `--hours 12`, includes overnight ClickUp activity
- Non-destructive: script only reads, never writes/modifies ClickUp data
- Falls back gracefully if token not configured

## Tech Debt
- Claude Code OAuth token expired (2026-03-05) — needs re-auth via `claude /login`
- Claude Code API credit balance too low for --model sonnet fallback
- **CLICKUP_API_TOKEN not yet configured** — Brandon needs to generate and add to .env
(add items here as discovered)
