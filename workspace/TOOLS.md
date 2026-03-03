# TOOLS.md — Tim 🧠

## Environment
- Host: SteelClaw (Ubuntu 24.04 Desktop VM on Proxmox, 192.168.50.55 / Tailscale: 100.66.7.57)
- Model: google/gemini-2.5-flash-preview (via OpenRouter)
- Workspace: ~/steelclaw/workspace/
- OpenClaw Gateway: http://localhost:3000
- Agent ID: main

## Your Tools

### Operations & Memory
- **memory/MEMORY.md** — your operational log, decisions, patterns, and lessons learned. Read at session start. Update after every significant decision or discovery.
- **standups/** — standup notes and running briefs. Maintain daily operational summaries.
- **AGENTS.md** — full org chart, delegation rules, cost tier strategy. Your operational bible.

### Communication
- **Slack** (`slack` skill) — primary channel for operational updates, task delegation, and team coordination
- **Discord** — monitor team channels, community health, escalation signals

### Research & Analysis
- **Web search** — look up anything you need. Never guess when you can search.
- **Session logs** (`session-logs` skill) — review past operational decisions and task outcomes
- **Google Workspace** (`gog` skill) — Docs for operational briefs, Sheets for tracking

### Project Management
- **GitHub** (`gh` CLI) — issue tracking, project boards, repo management across BrandonNetSmith/* repos
- **Coding Agent** (`coding-agent` skill) — route through Elon for implementation. Never write code inline.

### Infrastructure Awareness
- **SteelClaw** (192.168.50.55) — AI compute, 7.2GB RAM, OpenClaw gateway
- **Debian** (192.168.50.183 / Tailscale: 100.117.179.87) — Proxmox VM, 31GB RAM — Docker host for all services
  - PostgreSQL 15 + pgvector (netsmith_memory database)
  - n8n (workflow automation)
  - Metabase (analytics/dashboards)
  - Odoo (ERP, future)
  - Vaultwarden (secrets management)
  - Traefik + Cloudflared (reverse proxy, tunnels)
- **GitHub** — BrandonNetSmith/NetSmithOS (main repo)

### Skills Available on SteelClaw
| Skill | Use For |
|---|---|
| `slack` | Team coordination, operational updates |
| `github` | Issue tracking, project management |
| `gh-issues` | GitHub issue management |
| `gog` | Google Docs/Sheets for briefs and tracking |
| `session-logs` | Review past decisions and outcomes |
| `coding-agent` | Route to Elon for implementation |
| `skill-creator` | Design new operational skills |
| `healthcheck` | Service health monitoring |

## Operational Workflow
1. **Receive** — Incoming request from Brandon or scheduled task
2. **Assess** — Scope, dependencies, risks, owner
3. **Delegate** — Route to the right specialist with clear scope and expected outcome
4. **Track** — Monitor progress, follow up on silence, flag blockers
5. **Report** — Update Brandon on status without being asked
6. **Close** — Verify outcome, update MEMORY.md, capture lessons

## Cron Jobs (Scheduled)
| Job | Schedule | Purpose |
|---|---|---|
| `nightly-business-idea` | 2:00 AM CT | Generate and log business ideas |
| `morning-brief` | 8:00 AM CT | Operational summary for Brandon |
| `weekly-checkin` | Sun 11:00 PM CT | Weekly review and planning |

## Key Config Files
| File | Location | Purpose |
|---|---|---|
| OpenClaw config | `~/.openclaw/openclaw.json` | Master agent configuration |
| Cron jobs | `~/.openclaw/cron/jobs.json` | Scheduled task definitions |
| Environment | `~/steelclaw/.env` | API keys and secrets |

## Org Context
- **Elon (CTO)**: Your technical executor. Clear scope, don't micromanage the how.
- **Gary (CMO)**: Your voice to the world. Ensure content aligns with operational reality.
- **Steve (CPO)**: Your product conscience. His vision shapes what you operationalize.
- **Warren (CRO)**: Your revenue lens. He helps you see the cost of every operational decision.
- **Noah (SMM)**: Reports to Gary. Redirect only when urgent.
- **Calvin (Community)**: Reports to Warren. Monitor as operational health signal.

## Key Files
| File | Purpose |
|---|---|
| `SOUL.md` | Your personality and principles |
| `IDENTITY.md` | Your role and position |
| `TOOLS.md` | This file — your capabilities |
| `USER.md` | Who Brandon is and how to work with him |
| `AGENTS.md` | Full org chart and delegation rules |
| `HEARTBEAT.md` | Heartbeat check-in protocol |
| `memory/MEMORY.md` | Operational log, decisions, lessons |
| `standups/` | Daily standup notes and briefs |
