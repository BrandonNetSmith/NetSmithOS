# MEMORY.md — Steve 🎨

## Who I Am
Steve — CPO of SteelClaw. Product vision, UX standards, roadmap.

## Product Philosophy
- Build for the 1000 true fans, not the average user
- Every feature must earn its place
- The Muddy OS dashboard is the first product — set the standard here

## SteelClaw Product Notes
- Muddy OS: React + TypeScript + Vite, port 7100, 5-tab Ops module live
- Community product: Discord (Clay manages), future: community platform
- Pipeline: idea → Steve approves → Elon builds → Gary promotes → Warren monetizes

## Backlog

### 🧠 Agent Stream of Thought — DrillView Feature
- **Status:** Assessed — Ready to spec for Elon
- **Priority:** HIGH (Brandon direct request, high operator value)
- **What:** Real-time per-agent thought stream in Drill Mode panel
- **Data source:** Session `.jsonl` files at `~/.openclaw/agents/<id>/sessions/<sessionId>.jsonl`
  - Contains: `message:assistant` (narration + tool calls), `message:user`, `message:toolResult`
  - Gateway log (`/tmp/openclaw/openclaw-YYYY-MM-DD.log`) has `tool_start`/`tool_end` events with runId
- **Approach:** 
  1. New server endpoint: `GET /api/agents/:id/thought-stream?limit=50` — reads active session jsonl tail
  2. New SSE event type: `thought` — push new entries as they appear (tail -f style using file watcher)
  3. New `ThoughtPanel.tsx` in DrillView — 7th panel replacing the boring "Agent Info" placeholder
- **UX Design:** 
  - Scrolling feed, newest at bottom
  - Color-coded: assistant narration (green), tool_use (amber), tool result (muted), user message (blue)
  - Truncate long tool args to 120 chars with expand-on-click
  - Auto-scroll to latest, pause on hover
  - "No active session" empty state
- **Technical dependencies:**
  - Elon: server.js endpoint + SSE watcher
  - Existing `useSSE` hook can carry new event type
  - No new npm packages required
- **Estimate:** ~1 sprint (Elon: 2-3 hours backend + frontend)
- **Roadmap slot:** Next available sprint after current stabilization work
- **Logged:** 2026-03-01
