# Elon's Memory — Architecture Decisions & Technical Log

## 2026-03-06 — Nightly Dashboard Maintenance

### Bugs Fixed
- Removed dead code: `LabStub.tsx` and `BrainStub.tsx` (never imported anywhere)
- Fixed Elon's emoji in ActivityLog.tsx AGENT_META (was ⚡, should be 🔨 to match app-wide usage)
- Fixed Boardroom.tsx: Warren was labeled CFO (should be CRO), Noah was labeled CSO (should be SMM)
- Fixed Docs.tsx: Referenced "Muddy OS" instead of "NetSmith OS", referenced stale sidebar modules
- Removed `console.log` from BridgeView.tsx SSE handler (production noise)
- Converted Workspaces page from hardcoded 2-agent list to dynamic API fetch from /api/agents

### New Feature: Ctrl+K Command Palette
- Global keyboard shortcut (Ctrl+K / Cmd+K) opens searchable command palette
- Lists all navigation pages, all agents for drill-through, and action commands (forge, chat)
- Keyboard-only operation: arrow keys, Enter to select, Escape to close
- Fuzzy search across labels, descriptions, and keyword aliases
- Files: `src/components/CommandPalette.tsx`, `src/styles/command-palette.css`
- Integrated into ModeRouter.tsx (both drill and main layout branches)

### Architecture Notes
- netsmith-os is React+TypeScript+Vite, served on port 7100
- API server on port 7101 (Express, server.js)
- Service: `systemctl --user restart netsmith-os.service`
- Repo: github.com/BrandonNetSmith/NetSmithOS on `main` branch
- 42 source files across src/ — well-structured with bridge/drill/forge/pages/components/api/hooks/modes/styles/modules
- Claude Code was out of credits — all work done via direct sed/python patches and shell commands
