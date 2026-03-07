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

## New Product Concepts — Explored 2026-03-06

### 💡 Product Idea Investigation — Boss Request
Three candidate products emerged from deep market research. All three leverage our existing SteelClaw/OpenClaw infrastructure and team strengths. Ranked by strategic fit and speed to revenue.

---

### 🏆 CONCEPT A: ClawHub Pro — Premium OpenClaw Skills Marketplace
**Status:** NEW — Under Consideration
**Priority:** HIGH — aligns with what we already own
**One Sentence:** A premium skill marketplace where developers publish and sell OpenClaw agent skills, and users subscribe to unlock the best ones.

**The Problem:**
OpenClaw is open-source and free. It's gaining adoption (Wikipedia article exists, multiple cloud providers feature it). But ClawHub.com exists as a free skill repo — there's no monetization layer. Developers build skills and get nothing. Users can't easily find quality vs. garbage.

**The Opportunity:**
- App Store model for AI agent skills
- Developers earn 70% of every skill sale (30% to us)
- Monthly subscription tier unlocks the entire "Pro Skills" catalog
- We curate quality — only verified skills get the Pro badge

**Revenue Model:**
- $9/mo "Individual Pro" — unlimited pro skill installs
- $29/mo "Team" — 5 seats, team-shared skills
- $99/mo "Business" — unlimited seats, priority support
- Developer revenue share (30% platform cut)

**Why We Win:**
- We ARE the platform. We control the distribution channel.
- Zero customer acquisition cost for the first wave — every OpenClaw user is a prospect.
- Network effects: more skills → more users → more developers → more skills

**Build Effort:** Medium (Elon builds payment layer, we curate skills, Gary launches)
**Estimate:** 6-8 weeks to MVP
**Logged:** 2026-03-06

---

### 🥈 CONCEPT B: NetSmith AI Ops — Managed AI Team-as-a-Service
**Status:** NEW — Under Consideration
**Priority:** HIGH — monetizes our exact internal setup
**One Sentence:** We sell small businesses a pre-configured AI executive team (like our SteelClaw agents) that runs their daily ops on autopilot.

**The Problem:**
SMBs can't afford CMOs, CPOs, or a content team. But they need someone to write emails, post content, follow up with leads, schedule, and maintain their online presence. They hear about AI but don't know how to set it up. They have no SteelClaw.

**The Opportunity:**
We productize exactly what we've built. NetSmith AI Ops is a done-for-you managed AI team:
- "Gary" handles their content and social
- "Warren" monitors their revenue and sends weekly reports
- "Tim" runs their morning brief and task triage
- We host it, we maintain it, they get Slack/Discord access to their agents

**Revenue Model:**
- $149/mo "Starter" — 2 agents (content + ops)
- $299/mo "Growth" — 4 agents (content + ops + sales + analytics)
- $699/mo "Pro" — full team, custom skills, dedicated support
- One-time setup fee: $500 (white-glove onboarding)

**Why We Win:**
- We're not selling software. We're selling outcomes.
- Competitors sell tools. We sell a functioning AI team, pre-integrated.
- Our SteelClaw stack IS the product. No new engineering — just packaging.

**Build Effort:** Low (it's what we already run) — marketing and onboarding are the work
**Estimate:** 4 weeks to first paying customer if Gary leads launch
**Logged:** 2026-03-06

---

### 🥉 CONCEPT C: Muddy OS — B2B Dashboard for AI Teams
**Status:** NEW — Under Consideration
**Priority:** MEDIUM — longer runway, higher ceiling
**One Sentence:** Sell Muddy OS as a SaaS product — a beautiful, real-time operations dashboard for small companies running AI agent teams.

**The Problem:**
Everyone is spinning up AI agents. Nobody has a great way to see what they're all doing, what's running, what's broken. Existing dashboards are developer tools — not something you'd show your boss.

**The Opportunity:**
Muddy OS is already built. It's good-looking, real-time, and agent-aware. Package it as a SaaS, multi-tenant, let other teams plug in their own OpenClaw agents and see everything in one beautiful ops console.

**Revenue Model:**
- $49/mo "Starter" — up to 3 agents, 1 user
- $149/mo "Teams" — up to 10 agents, 5 users
- $499/mo "Enterprise" — unlimited agents, custom branding, SLA
- Annual discount: 20%

**Why We Win:**
- First-mover in "AI team operations dashboard" category
- Defensible moat: the UX is what competitors lack
- Integrates natively with OpenClaw ecosystem

**Build Effort:** High (Elon must build multi-tenancy, auth, billing infra)
**Estimate:** 3-4 months to beta
**Logged:** 2026-03-06

---

---

## 💡 NEW CONCEPT — Movement Solutions Physical Therapy
**Status:** NEW — Under Evaluation
**Date Logged:** 2026-03-06
**Priority:** MEDIUM-HIGH — vertical AI play with real market pull
**One Sentence:** An AI-powered physical therapy operations platform that gives PT clinics a full managed AI team for scheduling, documentation, patient engagement, and movement analytics.

---

### The Idea
"Movement Solutions Physical Therapy" can mean two very different things, and we need to pick one:

**Path A — AI Ops for PT Clinics (B2B SaaS)**
NetSmith AI Ops, but purpose-built for physical therapy practices. Instead of selling a generic "AI executive team," we go vertical: give PT clinic owners a managed AI system that handles:
- Appointment scheduling and reminders
- Post-visit SOAP note generation (massive time sink for PTs)
- Home exercise program delivery via patient-facing app/messages
- Insurance authorization follow-up (hate task — PTs spend hours on this)
- Review and reputation management
- Patient re-engagement (lapsed patients)

**Path B — Standalone Digital PT Brand (D2C)**
"Movement Solutions" becomes a consumer-facing physical therapy service powered by our AI stack. AI-guided movement assessments, personalized home exercise programs, and virtual PT coaching — all delivered via a mobile-first experience. Monthly subscription. Think: Headspace for PT.

**Path C — ClawHub Skills Package for PT**
A specialized bundle of OpenClaw skills sold on ClawHub Pro specifically for physical therapy operators. A "PT Practice Pack" — 5-8 skills covering the top pain points. Skills handle: SOAP notes, appointment follow-ups, insurance auth, patient outreach. Operators buy the pack and plug it into their existing OpenClaw + NetSmith setup.

---

### Steve's Evaluation

**The real insight:** PT is one of the most documentation-burdened healthcare professions. A therapist spends ~35% of their day on admin — notes, scheduling, insurance, outreach. That is *exactly* where AI wins. The hands-on work stays human. Everything else gets automated.

**Which path wins?**

Path A (NetSmith AI Ops for PT) is the sharpest move near-term:
- It's a direct vertical play on Concept B (NetSmith AI Ops) from our existing pipeline
- PT clinics are SMBs — exactly our target customer
- HIPAA compliance is a real moat (not everyone can clear that bar)
- Recurring revenue, high retention (PT clinics don't switch tools easily)
- Differentiated: most competitors sell point solutions (just scheduling, or just notes). We sell the whole ops team.

Path C (ClawHub Skills Pack) is the lowest-friction entry point:
- Zero new infrastructure
- Validates demand before we commit to a full vertical product
- If 50 PT clinics buy a "PT Practice Pack" on ClawHub, we have proof to build Path A

Path B (D2C brand) is the most interesting long-term, but premature. Consumer health is a hard go-to-market, regulatory risk is higher, and we'd need clinical credibility before scaling.

**Recommendation:** Start with Path C. Build a PT Skills Pack for ClawHub Pro. Use it to collect signal. If revenue + demand justifies it, promote to a full NetSmith AI Ops vertical (Path A) with HIPAA-compliant hosting by Q3 2026.

---

### Market Validation
- U.S. AI in Physical Therapy market: ~$224M in 2026 → $1.7B by 2035 (CAGR 25%)
- Global PT software market: $29.57B in 2026 (CAGR 8.8%)
- Top PT pain points: documentation (SOAP notes), scheduling, insurance auth, patient adherence
- Competitors: WebPT, PTeverywhere, MedBridge — none offer a full AI Ops team model
- White space: vertical AI team management for PT clinics is wide open

---

### Open Questions for Brandon
1. Is "Movement Solutions Physical Therapy" a business Brandon already owns, or a product we're building from scratch? (This changes everything.)
2. If it's an existing business: do they want AI tooling for their own ops, or a product to sell to other PT clinics?
3. HIPAA compliance appetite — what's our risk tolerance here?

---

### Suggested Next Steps
1. Brandon clarifies the intent (existing biz vs. new product concept)
2. If new concept: Steve specs a "PT Practice Pack" for ClawHub Pro (5 skills: SOAP notes, scheduling reminders, insurance follow-up, patient re-engagement, review requests)
3. Gary assesses go-to-market narrative: "The AI that gives your PTs their afternoons back"
4. Warren models revenue: 50 clinics × $99/mo PT Pack = $59K ARR baseline, scaling fast
5. Elon scopes HIPAA hosting requirements if we pursue Path A

---

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
