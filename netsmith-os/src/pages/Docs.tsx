import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface DocSection {
  id: string
  title: string
  content: string
}

const docs: DocSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    content: `# What is NetSmith OS?

NetSmith OS is the operational dashboard and control center for SteelClaw's AI agent infrastructure. It provides a unified interface for managing, monitoring, and coordinating multiple AI agents working together as a virtual executive team.

## Key Features

- **Task Manager**: Monitor active sessions, model usage, token consumption, and costs across all agents
- **Organization Chart**: Visualize the agent hierarchy and team structure
- **Executive Standups**: Coordinate meetings between agents and review transcripts
- **Workspaces**: Browse and edit agent configuration files
- **Documentation**: Reference guides for all system components

## Architecture

NetSmithOS runs as a local web application that reads directly from the filesystem and OpenClaw configuration files. There's no backend database — everything operates on your existing agent infrastructure.

### Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Styling**: Custom CSS with dark mode and phosphor emerald accents
- **Data**: Direct filesystem reads from workspace directories
- **Deployment**: systemd user service on port 7100

## Getting Started

1. The dashboard auto-loads at \`http://localhost:7100\`
2. Navigate using the left sidebar to access Bridge, Health, Org Chart, and more
3. Use the top navigation within each module to access different features
4. Settings gear at bottom for configuration

---

*Built for SteelClaw operations by the agent team.*`
  },
  {
    id: 'task-manager',
    title: 'Task Manager',
    content: `# Task Manager

The Task Manager provides real-time visibility into agent operations and resource usage.

## Stats Overview

The top stats row shows key metrics:
- **Active Sessions**: Currently running agent conversations
- **Idle Sessions**: Paused or waiting sessions
- **Total Sessions**: Lifetime session count
- **Tokens Used**: Aggregate token consumption
- **Total Cost**: Estimated API costs

## Model Fleet

Each configured model appears as a card showing:
- Model name and purpose
- Authentication method
- Active/Inactive status
- Cost per 1M tokens
- Token usage and session count

## Active Sessions

Live view of currently running sessions:
- Agent name
- Model being used
- Time since last activity
- Token count for session

## Auto-Refresh

Data refreshes automatically every 30 seconds. The last refresh timestamp is shown at the bottom of the page.`
  },
  {
    id: 'org-chart',
    title: 'Organization Chart',
    content: `# Organization Chart

Visualize the agent team hierarchy and status.

## Team Structure

The org chart shows the reporting structure:
- **CEO**: Brandon (Human) — Ultimate authority
- **COO**: Tim — Operations lead, reports to CEO
- **C-Suite**: Future executives (CTO, CMO, CRO)
- **Staff**: Direct reports like Calvin (Community)

## Agent Cards

Each agent card displays:
- Avatar and name
- Role (CEO, COO, etc.) and title
- Model powering the agent (if AI)
- Status badge

## Status Types

- **Active**: Agent is operational and in use
- **Scaffolded**: Structure defined, not yet activated
- **Future**: Planned but not yet created
- **Deprecated**: No longer in active use

## Navigation

- Click on any agent with reports to expand/collapse
- Use "Expand All" / "Collapse All" buttons for quick navigation
- Legend at bottom explains status colors`
  },
  {
    id: 'workspaces',
    title: 'Team Workspaces',
    content: `# Team Workspaces

Browse and edit agent workspace files.

## Agent Workspaces

Each agent has a dedicated workspace directory:
- **Tim (Main)**: \`~/steelclaw/workspace/\`
- **Clay**: \`~/steelclaw/workspace-clay/\`

## Core Files

Standard workspace files include:
- **AGENTS.md**: Agent behavior guidelines
- **SOUL.md**: Personality and identity
- **USER.md**: Information about the human
- **IDENTITY.md**: Agent's self-conception
- **TOOLS.md**: Local tool configuration
- **MEMORY.md**: Long-term memory (main session only)
- **HEARTBEAT.md**: Periodic task checklist

## File Operations

- **Preview**: Rendered markdown with syntax highlighting
- **Edit**: Raw text editor with save functionality
- Changes save directly to the filesystem

## Security Note

MEMORY.md should only be loaded in main sessions (direct chats with the human) to prevent private context from leaking to shared contexts.`
  },
  {
    id: 'subagents',
    title: 'Sub-Agents & Spawning',
    content: `# Sub-Agents & Spawning

Understanding how agents spawn and coordinate.

## What are Sub-Agents?

Sub-agents are isolated sessions spawned by a parent agent to handle specific tasks. They:
- Run independently with their own context
- Can use different models than the parent
- Report back when complete
- Clean up automatically

## Spawning Methods

### sessions_spawn
\`\`\`typescript
sessions_spawn({
  task: "Research competitor pricing",
  runtime: "subagent",
  mode: "run",  // one-shot
  model: "gemini-2.5-flash"
})
\`\`\`

### Persistent Sessions
\`\`\`typescript
sessions_spawn({
  task: "Monitor inbox",
  runtime: "subagent", 
  mode: "session",  // persistent
  thread: true
})
\`\`\`

## Monitoring

Use the \`subagents\` tool to:
- **list**: See active sub-agents
- **steer**: Send guidance to running agents
- **kill**: Terminate a sub-agent

## Best Practices

- Use sub-agents for isolated, parallelizable work
- Choose appropriate models (fast for simple tasks)
- Set reasonable timeouts
- Let completion notifications come to you (push-based)`
  },
  {
    id: 'gateway-vs-subagents',
    title: 'Gateway vs Sub-Agents',
    content: `# Gateway vs Sub-Agents

Understanding the difference between scheduling approaches.

## Cron Jobs (Gateway)

Use cron when:
- **Exact timing matters** ("9:00 AM every Monday")
- **Task needs isolation** from main session history
- **Different model/thinking** level needed
- **One-shot reminders** ("remind me in 20 minutes")
- **Direct channel delivery** without main session

### Example
\`\`\`typescript
cron({
  action: "add",
  job: {
    schedule: { kind: "cron", expr: "0 9 * * 1" },
    payload: { kind: "agentTurn", message: "Weekly report" },
    sessionTarget: "isolated"
  }
})
\`\`\`

## Heartbeats (Main Session)

Use heartbeats when:
- **Multiple checks can batch** (inbox + calendar + notifications)
- **Conversational context** needed from recent messages
- **Timing can drift** (every ~30 min is fine)
- **Reducing API calls** by combining periodic checks

### HEARTBEAT.md
Keep a small checklist of periodic tasks. The agent runs through them on each heartbeat poll.

## Hybrid Approach

- Batch similar periodic checks into HEARTBEAT.md
- Use cron for precise schedules and standalone tasks
- Track check timestamps in \`memory/heartbeat-state.json\``
  },
  {
    id: 'voice-standup',
    title: 'Voice Standup',
    content: `# Voice Standup

Running executive standups with voice output.

## Overview

The Standup feature allows you to:
- Review past meeting transcripts
- Start new standup meetings
- Get voice-narrated summaries (when TTS is configured)

## Starting a Standup

1. Click "+ New Standup"
2. Enter a topic or agenda
3. The system prompts each agent for updates
4. Transcript is saved to \`~/steelclaw/workspace/standups/\`

## Voice Output

If the \`sag\` (ElevenLabs TTS) tool is available:
- Standups can be narrated aloud
- Each agent uses their configured voice
- Great for "storytime" summaries

## Transcript Format

Standups follow a standard format:
- **Attendees**: Who's present
- **Updates**: Yesterday / Today / Blockers per agent
- **Action Items**: Tasks assigned
- **Next Meeting**: Scheduled follow-up`
  },
  {
    id: 'memory-architecture',
    title: 'Memory Architecture',
    content: `# Memory Architecture

How agents maintain continuity across sessions.

## The Problem

AI agents wake up fresh each session with no inherent memory. Files provide the persistence layer.

## Memory Types

### Daily Notes
\`memory/YYYY-MM-DD.md\`

Raw logs of what happened each day:
- Decisions made
- Tasks completed
- Important conversations
- Context worth preserving

### Long-Term Memory
\`MEMORY.md\`

Curated, distilled knowledge:
- Significant events
- Lessons learned
- Preferences discovered
- Relationships and context

## Memory Flow

1. **During sessions**: Capture important info in daily notes
2. **Periodically**: Review daily notes, update MEMORY.md
3. **Each session**: Load MEMORY.md (main session only)
4. **Over time**: Prune outdated info from MEMORY.md

## Security

- MEMORY.md contains personal context
- Only loaded in main sessions (direct chats)
- NOT loaded in shared contexts (Discord, groups)
- Prevents private info from leaking

## Best Practice

> "Mental notes" don't survive session restarts. Files do.

When you want to remember something, **write it down**. Update the relevant file immediately.`
  }
]

export default function Docs() {
  const [selectedDoc, setSelectedDoc] = useState<DocSection>(docs[0])

  return (
    <div className="two-panel" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="panel-sidebar">
        <div className="sidebar-section">
          <div className="sidebar-section-title">Documentation</div>
          {docs.map((doc) => (
            <div
              key={doc.id}
              className={`sidebar-item ${selectedDoc.id === doc.id ? 'active' : ''}`}
              onClick={() => setSelectedDoc(doc)}
            >
              {doc.title}
            </div>
          ))}
        </div>
      </div>

      <div className="panel-main">
        <div className="markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {selectedDoc.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
