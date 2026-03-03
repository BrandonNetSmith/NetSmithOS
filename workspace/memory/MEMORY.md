# MEMORY.md — Tim's Long-Term Memory

## Who I Am
Tim — COO of NetSmith. Operational backbone and orchestrator for Brandon.
My home: ~/steelclaw/workspace/
My agent ID: main
My model: google/gemini-2.5-flash-preview

## SteelClaw Setup (as of 2026-02-28)
- OpenClaw gateway running on Ubuntu 24.04 Desktop VM (Proxmox) at 192.168.50.55
- Tailscale IP: 100.66.7.57
- Memory/semantic recall: enabled (OpenAI text-embedding-3-small)
- 7 agents: Tim (main), Elon, Gary, Noah, Warren, Steve, Calvin
- GitHub: BrandonNetSmith/NetSmithOS (gh CLI authenticated)

## Debian VM on Proxmox (192.168.50.183 / Tailscale: 100.117.179.87)
- PostgreSQL 15 + pgvector (netsmith_memory database, agent_memories table)
- n8n, Metabase, Odoo, Vaultwarden, Traefik, Cloudflared
- 31GB RAM, 192GB disk — all services run in Docker containers

## Cron Jobs
- nightly-business-idea (2am CT)
- morning-brief (8am CT)
- weekly-checkin (Sun 11pm CT)

## Brandon's Preferences
**Brandon's Current Location:** Boiling Springs, SC (default, unless otherwise specified).
- Timezone: America/Chicago (CT)
- Slack DM for private delivery; Discord for team coordination
- Values autonomy — don't ask permission for things within scope
- Direct and concise communication — results first, method second

## Patterns & Lessons
- `openclaw config set agents.<name>.model.primary` is INVALID — use `agents.defaults.model.primary`
- `openclaw skills check` takes NO arguments — just run it bare
- Heredoc with unquoted EOF executes backticks — use Python for file writes with backticks
- `openclaw cron add` requires `--name` flag (not optional)
- Nested .git directories block `git add` — remove them before staging
- SSH between machines uses Tailscale IPs (100.x.x.x)
- PostgreSQL on Debian: user=admin, db=automation (not "postgres")
- **2026-03-01: Accurate Cron Schedule Reporting:** When reporting on cron job schedules, always state the *next scheduled run* based on the active cron configuration, and explicitly clarify when a new schedule takes effect (e.g., "starting tomorrow"), rather than inferring or continuing to report on an old, superseded schedule to avoid confusion.

## Decisions & Preferences
Update as you learn more from Brandon.

### Communication
- **2026-03-01: Heartbeat delivery failures.** Attempts to send heartbeat updates to Slack DM failed with "user_not_found". Attempts to send to Discord via specific channel names (e.g., `#muddy-tasks`) failed with "Unknown target" or "Unknown channel".
- **2026-03-01: Cron job delivery failures.** `morning-brief`, `nightly-netsmith-feature`, and `email-triage` cron jobs failed delivery with error: "Channel is required when multiple channels are configured: discord, slack, signal Set delivery.channel explicitly or use a main session with a previous channel."
- **2026-03-01: Discord task channel ID:** `1476698050515701821` (for `muddy-tasks`).
- **2026-03-01: Slack DM target:** "Tim" app (requires Brandon's Slack User ID).

- **2026-03-01: Slack DM Test Success:** A direct test message to Brandon's Slack User ID (`U09T0QWG0VD`) was successful, confirming Slack communication is functional. Old cron job deliveries for this session failed because I mistakenly tried to edit the jobs.json file directly instead of using the `openclaw cron edit` command. The updated approach will be to use the CLI tool.
