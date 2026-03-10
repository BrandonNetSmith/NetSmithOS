import dotenv from "dotenv";
import { join as dotenvJoin } from "path";
import { homedir as dotenvHome } from "os";
dotenv.config({ path: dotenvJoin(dotenvHome(), "steelclaw", ".env") });

import express from 'express';
import cors from 'cors';
import { readdir, readFile, writeFile, stat, mkdir } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import { join, resolve } from 'path';
import { homedir, cpus, totalmem, freemem, hostname, platform, release, arch, uptime as osUptime } from 'os';
import { execFile, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// ─── Phase 2: Chat Channels — SQLite persistence ────────────────────────────
import BetterSqlite3 from 'better-sqlite3';
import crypto from 'crypto';


const execFileAsync = promisify(execFile);

const app = express();
app.use(cors());
app.use(express.json());

const HOME = homedir();
const OPENCLAW_CONFIG = join(HOME, '.openclaw', 'openclaw.json');
const CRON_JOBS_FILE = join(HOME, '.openclaw', 'cron', 'jobs.json');
const CRON_RUNS_DIR = join(HOME, '.openclaw', 'cron', 'runs');
const STANDUPS_DIR = join(HOME, 'steelclaw', 'workspace', 'standups');
const AGENT_PREFS_FILE = join(HOME, 'steelclaw', 'netsmith-os', 'agent-prefs.json');

// ─── Agent preferences (thinking level, etc.) ──────────────────────────────────
async function loadAgentPrefs() {
  try {
    const data = await readFile(AGENT_PREFS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveAgentPrefs(prefs) {
  await writeFile(AGENT_PREFS_FILE, JSON.stringify(prefs, null, 2));
}

async function getAgentPref(agentId, key, defaultVal) {
  const prefs = await loadAgentPrefs();
  return prefs?.[agentId]?.[key] ?? defaultVal;
}

async function setAgentPref(agentId, key, value) {
  const prefs = await loadAgentPrefs();
  if (!prefs[agentId]) prefs[agentId] = {};
  prefs[agentId][key] = value;
  await saveAgentPrefs(prefs);
}

// "main" is a reserved openclaw agent ID — remap it to "tim"
const AGENT_ID_MAP = { main: 'tim' };
function resolveAgentId(id) { return AGENT_ID_MAP[id] || id; }

const WORKSPACES = {
  'main': join(HOME, 'steelclaw', 'workspace'),
  'tim': join(HOME, 'steelclaw', 'workspace'),
  'elon': join(HOME, 'steelclaw', 'workspace-elon'),
  'gary': join(HOME, 'steelclaw', 'workspace-gary'),
  'warren': join(HOME, 'steelclaw', 'workspace-warren'),
  'noah': join(HOME, 'steelclaw', 'workspace-noah'),
  'steve': join(HOME, 'steelclaw', 'workspace-steve'),
  'clay': join(HOME, 'steelclaw', 'workspace-clay'),
  'calvin': join(HOME, 'steelclaw', 'workspace-calvin'),
};


// ─── Enabled agents (only these will show as active in the dashboard) ────────────
const ENABLED_AGENTS = new Set(['main', 'tim']);

// ─── Agent display metadata ─────────────────────────────────────────────────────
const AGENT_META = {
  main: { name: "Tim", role: "COO", emoji: "🧠" },
  tim:  { name: "Tim", role: "COO", emoji: "🧠" },
  elon: { name: "Elon", role: "CTO", emoji: "⚡" },
  gary: { name: "Gary", role: "CMO", emoji: "📢" },
  warren: { name: "Warren", role: "CRO", emoji: "💰" },
  steve: { name: "Steve", role: "CPO", emoji: "🎯" },
  noah: { name: "Noah", role: "SMM", emoji: "📱" },
  clay: { name: "Clay", role: "Community", emoji: "🦞" },
  calvin: { name: "Calvin", role: "Community", emoji: "🤝" },
};

// ─── Pricing data ───────────────────────────────────────────────────────────────
const PRICING_PATH = join(__dirname, 'src', 'server', 'pricing.json');
let PRICING = {};
try {
  const pricingRaw = await readFile(PRICING_PATH, 'utf-8');
  PRICING = JSON.parse(pricingRaw);
} catch (err) {
  console.error('Warning: Could not load pricing.json:', err.message);
}

// ─── CLI output cache ───────────────────────────────────────────────────────────
const cliCache = new Map();
const CLI_CACHE_TTL = 30_000; // 30 seconds — SSE pushes realtime updates // 10 seconds

// Track recently-stopped agents to override status to 'idle' immediately
const stoppedAgents = new Map(); // agentId -> timestamp
function markAgentStopped(agentId) {
  stoppedAgents.set(agentId, Date.now());
  // Auto-clear after 5 minutes
  setTimeout(() => stoppedAgents.delete(agentId), 5 * 60 * 1000);
}
function isAgentRecentlyStopped(agentId) {
  const ts = stoppedAgents.get(agentId);
  if (!ts) return false;
  if (Date.now() - ts > 5 * 60 * 1000) {
    stoppedAgents.delete(agentId);
    return false;
  }
  return true;
}



// ─── Phase 2: Chat Channels — SQLite database ──────────────────────────────

const CHAT_DB_PATH = join(HOME, '.netsmith', 'chat.db');

function initChatDB() {
  // Ensure directory exists
  const dbDir = join(HOME, '.netsmith');
  try { execSync(`mkdir -p "${dbDir}"`); } catch {}

  const db = new BetterSqlite3(CHAT_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'group',
      description TEXT,
      participants TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      last_message_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      parent_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);
  `);

  // Seed default channels if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM channels').get();
  if (count.c === 0) {
    console.log('[chat] Seeding default channels...');
    const now = Date.now();
    const insert = db.prepare('INSERT INTO channels (id, name, type, description, participants, created_at) VALUES (?, ?, ?, ?, ?, ?)');

    const seed = db.transaction(() => {
      insert.run('general', '#general', 'group', 'Company-wide discussion', JSON.stringify(['main','elon','gary','warren','steve','noah','clay','calvin','human']), now);
      insert.run('strategy', '#strategy', 'group', 'Strategy and planning', JSON.stringify(['main','elon','warren','human']), now);
      insert.run('engineering', '#engineering', 'group', 'Engineering and technical', JSON.stringify(['elon','human']), now);
      insert.run('dm-main', 'Tim', 'direct', null, JSON.stringify(['main','human']), now);
      insert.run('dm-elon', 'Elon', 'direct', null, JSON.stringify(['elon','human']), now);
      insert.run('dm-gary', 'Gary', 'direct', null, JSON.stringify(['gary','human']), now);
      insert.run('dm-warren', 'Warren', 'direct', null, JSON.stringify(['warren','human']), now);
      insert.run('dm-steve', 'Steve', 'direct', null, JSON.stringify(['steve','human']), now);
      insert.run('dm-noah', 'Noah', 'direct', null, JSON.stringify(['noah','human']), now);
    });
    seed();
    console.log('[chat] Default channels seeded.');
  }

  return db;
}

const chatDB = initChatDB();

// SSE clients per channel
const channelStreamClients = new Map(); // channelId -> Set<res>

function broadcastChannelMessage(channelId, message) {
  const clients = channelStreamClients.get(channelId);
  if (!clients || clients.size === 0) return;
  const data = JSON.stringify(message);
  for (const res of clients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

// Agent routing for group channels
function routeGroupMessage(content, participants) {
  // Check @mentions first
  const mentionMatch = content.match(/@(\w+)/g);
  if (mentionMatch) {
    for (const mention of mentionMatch) {
      const name = mention.slice(1).toLowerCase();
      // Match against agent IDs and names
      for (const [id, meta] of Object.entries(AGENT_META)) {
        if (id === 'tim') continue; // skip alias
        if (id === name || meta.name.toLowerCase() === name) {
          if (participants.includes(id) || (id === 'main' && participants.includes('main'))) {
            return id;
          }
        }
      }
    }
  }

  // Keyword matching
  const lower = content.toLowerCase();
  const keywordMap = [
    { keywords: ['code', 'build', 'tech', 'bug', 'deploy', 'server', 'api', 'database', 'engineering'], agent: 'elon' },
    { keywords: ['marketing', 'social', 'brand', 'content', 'campaign', 'audience', 'viral'], agent: 'gary' },
    { keywords: ['revenue', 'sales', 'money', 'profit', 'invest', 'financial', 'cost', 'budget'], agent: 'warren' },
    { keywords: ['growth', 'seo', 'traffic', 'analytics', 'funnel', 'conversion'], agent: 'noah' },
    { keywords: ['product', 'design', 'user', 'ux', 'feature', 'roadmap'], agent: 'steve' },
    { keywords: ['strategy', 'plan', 'vision', 'goal', 'objective', 'direction', 'priority'], agent: 'main' },
  ];

  for (const { keywords, agent } of keywordMap) {
    if (participants.includes(agent) && keywords.some(kw => lower.includes(kw))) {
      return agent;
    }
  }

  // Default: first non-human participant
  const agentParticipants = participants.filter(p => p !== 'human');
  return agentParticipants.length > 0 ? agentParticipants[0] : null;
}


async function cachedExec(command, args, cacheKey) {
  const now = Date.now();
  const cached = cliCache.get(cacheKey);
  if (cached && (now - cached.ts) < CLI_CACHE_TTL) {
    return cached.data;
  }
  try {
    const { stdout } = await execFileAsync(command, args, { timeout: 15000 });
    const data = JSON.parse(stdout);
    cliCache.set(cacheKey, { ts: now, data });
    return data;
  } catch (err) {
    // Return cached data if available, even if stale
    if (cached) return cached.data;
    throw err;
  }
}


// ─── Async config helpers (non-blocking) ────────────────────────────────────────
async function getAgentsList() {
  return cachedExec('openclaw', ['config', 'get', 'agents.list', '--json'], 'agents-list-config');
}
// ─── In-memory alerts ───────────────────────────────────────────────────────────
let activeAlerts = [];

// ─── SSE clients ────────────────────────────────────────────────────────────────
const sseClients = new Set();

// ─── Model name normalization ───────────────────────────────────────────────────
function normalizeModelName(model) {
  if (!model) return 'unknown';
  // Strip provider prefixes (openrouter/anthropic/google/openai/deepseek)
  let name = model.replace(/^(openrouter\/|anthropic\/|google\/|openai\/|deepseek\/)/, '');
  // Also strip secondary provider prefix (e.g., "openrouter/anthropic/claude..." → "claude...")
  name = name.replace(/^(anthropic\/|google\/|openai\/|deepseek\/)/, '');
  // Map common short/versioned names to full pricing keys
  const aliases = {
    // Claude Opus variants
    'claude-opus-4-6': 'claude-opus-4-6-20250514',
    'claude-opus-4-6-20250514': 'claude-opus-4-6-20250514',
    'claude-opus-4-5': 'claude-opus-4-5-20250120',
    'claude-opus-4-5-20250120': 'claude-opus-4-5-20250120',
    'claude-opus-4': 'claude-opus-4-20250514',
    'claude-opus-4-20250514': 'claude-opus-4-20250514',
    // Claude Sonnet variants
    'claude-sonnet-4-6': 'claude-sonnet-4-6-20250514',
    'claude-sonnet-4-6-20250514': 'claude-sonnet-4-6-20250514',
    'claude-sonnet-4': 'claude-sonnet-4-20250514',
    'claude-sonnet-4-20250514': 'claude-sonnet-4-20250514',
    // Claude Haiku
    'claude-haiku-3': 'claude-haiku-3-20250307',
    'claude-haiku-3-20250307': 'claude-haiku-3-20250307',
    // Gemini
    'gemini-2.5-flash': 'gemini-2.5-flash',
    'gemini-flash-2.5': 'gemini-2.5-flash',
    'gemini-2.5-flash-preview': 'gemini-2.5-flash',
    'gemini-2.5-pro': 'gemini-2.5-pro',
    'gemini-2.0-flash': 'gemini-2.0-flash',
    'gemini-flash-2.0': 'gemini-2.0-flash',
    'gemini-2.0-flash-001': 'gemini-2.0-flash',
    // GPT
    'gpt-4o': 'gpt-4o',
    'gpt-4o-mini': 'gpt-4o-mini',
    // DeepSeek
    'deepseek-chat': 'deepseek-v3',
    'deepseek-v3': 'deepseek-v3',
    'deepseek-reasoner': 'deepseek-r1',
    'deepseek-r1': 'deepseek-r1',
  };
  return aliases[name] || name;
}

// ─── Cost calculation helpers ───────────────────────────────────────────────────
function calculateRunCost(run) {
  const modelKey = normalizeModelName(run.model);
  const rates = PRICING[modelKey];
  if (!rates || !run.usage) return 0;

  const inputTokens = run.usage.input_tokens || 0;
  const outputTokens = run.usage.output_tokens || 0;
  const totalTokens = run.usage.total_tokens || 0;
  const cachedInputTokens = run.usage.cached_input_tokens || run.usage.cache_read_input_tokens || 0;

  // Estimate thinking tokens: total - input - output (if total is larger)
  // Many models with extended thinking report total > input + output
  let thinkingTokens = 0;
  if (totalTokens > inputTokens + outputTokens) {
    thinkingTokens = totalTokens - inputTokens - outputTokens;
  }

  // Cached input tokens are cheaper (use cached_input rate if available)
  const regularInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const cachedRate = rates.cached_input || rates.input;

  const inputCost = regularInputTokens / 1_000_000 * rates.input;
  const cachedCost = cachedInputTokens / 1_000_000 * cachedRate;
  const outputCost = outputTokens / 1_000_000 * rates.output;
  const thinkingRate = rates.thinking || rates.output; // fallback to output rate
  const thinkingCost = thinkingTokens / 1_000_000 * thinkingRate;

  return inputCost + cachedCost + outputCost + thinkingCost;
}

async function readAllCronRuns() {
  const runs = [];
  try {
    const files = await readdir(CRON_RUNS_DIR);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      try {
        const content = await readFile(join(CRON_RUNS_DIR, file), 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const run = JSON.parse(line);
            runs.push(run);
          } catch { /* skip malformed lines */ }
        }
      } catch { /* skip unreadable files */ }
    }
  } catch { /* runs dir might not exist */ }
  return runs;
}

function computeCostSummary(runs) {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const weekMs = startOfWeek.getTime();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthMs = startOfMonth.getTime();

  let today = 0;
  let thisWeek = 0;
  let thisMonth = 0;
  const byAgent = {};
  const byModel = {};

  for (const run of runs) {
    if (run.action !== 'finished') continue;
    const cost = calculateRunCost(run);
    if (cost === 0) continue;

    const ts = run.ts || 0;

    // Extract agent from sessionKey: "agent:<agentId>:..."
    let agentId = 'unknown';
    if (run.sessionKey) {
      const parts = run.sessionKey.split(':');
      if (parts.length >= 2) agentId = parts[1];
    }

    const modelKey = normalizeModelName(run.model);

    // Accumulate by agent
    byAgent[agentId] = (byAgent[agentId] || 0) + cost;

    // Accumulate by model
    byModel[modelKey] = (byModel[modelKey] || 0) + cost;

    // Time-based buckets
    if (ts >= todayMs) today += cost;
    if (ts >= weekMs) thisWeek += cost;
    if (ts >= monthMs) thisMonth += cost;
  }

  // Burn rate: average daily cost this month
  const daysThisMonth = Math.max(1, (now - monthMs) / (1000 * 60 * 60 * 24));
  const burnRate = thisMonth / daysThisMonth;

  return { today, thisWeek, thisMonth, burnRate, byAgent, byModel };
}

// ─── Alert generation ───────────────────────────────────────────────────────────
async function generateAlerts() {
  const alerts = [];

  // Check gateway status
  try {
    await cachedExec('openclaw', ['status', '--json'], 'status');
  } catch {
    alerts.push({
      id: 'gateway-offline',
      severity: 'critical',
      message: 'OpenClaw gateway is offline or unreachable',
      ts: Date.now(),
    });
  }

  // Check for cron failures in last 24h
  try {
    const runs = await readAllCronRuns();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentFailures = runs.filter(
      r => r.action === 'finished' && r.status === 'error' && (r.ts || 0) >= cutoff
    );
    for (const fail of recentFailures) {
      alerts.push({
        id: `cron-fail-${fail.jobId}-${fail.ts}`,
        severity: 'warning',
        message: `Cron job ${fail.jobId} failed: ${(fail.error || 'unknown error').substring(0, 120)}`,
        ts: fail.ts,
        jobId: fail.jobId,
      });
    }
  } catch { /* ignore */ }

  // Check delivery queue failures from cron runs
  try {
    const runs = await readAllCronRuns();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const deliveryFailures = runs.filter(
      r => r.action === 'finished' && r.deliveryStatus === 'unknown' && (r.ts || 0) >= cutoff
    );
    for (const fail of deliveryFailures) {
      // Don't duplicate alerts already captured as cron failures
      if (fail.status === 'error') continue;
      alerts.push({
        id: `delivery-fail-${fail.jobId}-${fail.ts}`,
        severity: 'warning',
        message: `Delivery failed for job ${fail.jobId}`,
        ts: fail.ts,
        jobId: fail.jobId,
      });
    }
  } catch { /* ignore */ }

  activeAlerts = alerts;
  return alerts;
}

// ─── Ensure standups directory exists ───────────────────────────────────────────
if (!existsSync(STANDUPS_DIR)) {
  mkdir(STANDUPS_DIR, { recursive: true }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXISTING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// Get OpenClaw config
app.get('/api/config', async (req, res) => {
  try {
    const data = await readFile(OPENCLAW_CONFIG, 'utf-8');
    const config = JSON.parse(data);
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read config', details: err.message });
  }
});

// List workspace files
app.get('/api/workspace/:agent/files', async (req, res) => {
  const { agent } = req.params;
  const workspacePath = WORKSPACES[agent.toLowerCase()];

  if (!workspacePath) {
    return res.status(404).json({ error: 'Unknown agent' });
  }

  try {
    const entries = await readdir(workspacePath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = join(workspacePath, entry.name);
        const stats = await stat(filePath);
        files.push({
          name: entry.name,
          size: formatSize(stats.size),
          path: entry.name,
          fullPath: filePath,
        });
      }
    }

    // Also check memory directory
    const memoryDir = join(workspacePath, 'memory');
    if (existsSync(memoryDir)) {
      const memEntries = await readdir(memoryDir, { withFileTypes: true });
      for (const entry of memEntries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const filePath = join(memoryDir, entry.name);
          const stats = await stat(filePath);
          files.push({
            name: `memory/${entry.name}`,
            size: formatSize(stats.size),
            path: `memory/${entry.name}`,
            fullPath: filePath,
          });
        }
      }
    }

    res.json({ agent, path: workspacePath, files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list files', details: err.message });
  }
});

// Read workspace file
app.get('/api/workspace/:agent/file', async (req, res) => {
  const { agent } = req.params;
  const filePath = req.query.path;
  const workspacePath = WORKSPACES[agent.toLowerCase()];

  if (!workspacePath) {
    return res.status(404).json({ error: 'Unknown agent' });
  }

  if (!filePath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  try {
    const fullPath = resolve(workspacePath, filePath);
    if (!fullPath.startsWith(workspacePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const content = await readFile(fullPath, 'utf-8');
    res.json({ content, path: filePath });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read file', details: err.message });
  }
});

// Write workspace file
app.put('/api/workspace/:agent/file', async (req, res) => {
  const { agent } = req.params;
  const filePath = req.query.path;
  const { content } = req.body;
  const workspacePath = WORKSPACES[agent.toLowerCase()];

  if (!workspacePath) {
    return res.status(404).json({ error: 'Unknown agent' });
  }

  if (!filePath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  try {
    const fullPath = resolve(workspacePath, filePath);
    if (!fullPath.startsWith(workspacePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await writeFile(fullPath, content, 'utf-8');
    res.json({ success: true, path: filePath });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write file', details: err.message });
  }
});

// List standups
app.get('/api/standups', async (req, res) => {
  try {
    if (!existsSync(STANDUPS_DIR)) {
      return res.json({ standups: [] });
    }

    const entries = await readdir(STANDUPS_DIR, { withFileTypes: true });
    const standups = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = join(STANDUPS_DIR, entry.name);
        const content = await readFile(filePath, 'utf-8');
        const preview = content.split('\n').slice(0, 5).join(' ').substring(0, 100);

        const dateMatch = entry.name.match(/^(\d{4}-\d{2}-\d{2})/);
        const date = dateMatch ? formatDate(dateMatch[1]) : entry.name;

        standups.push({
          filename: entry.name,
          date,
          preview: preview + '...',
          path: filePath,
        });
      }
    }

    standups.sort((a, b) => b.filename.localeCompare(a.filename));
    res.json({ standups });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list standups', details: err.message });
  }
});

// Get standup content
app.get('/api/standups/:filename', async (req, res) => {
  const { filename } = req.params;
  try {
    const filePath = join(STANDUPS_DIR, filename);
    if (!filePath.startsWith(STANDUPS_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const content = await readFile(filePath, 'utf-8');
    res.json({ filename, content });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read standup', details: err.message });
  }
});

// Create new standup
const standupStreamClients = new Map(); // id -> Set<res>

app.post('/api/standups', async (req, res) => {
  const { topic, agents: requestedAgents } = req.body;
  const today = new Date().toISOString().split('T')[0];
  const standupId = `${today}-${Date.now()}`;
  const filename = `${today}-standup.md`;
  const filePath = join(STANDUPS_DIR, filename);

  // Determine attendee agent IDs
  const attendees = Array.isArray(requestedAgents) && requestedAgents.length > 0
    ? requestedAgents
    : ['main'];

  try {
    await mkdir(STANDUPS_DIR, { recursive: true });
    const header = `# Executive Standup - ${formatDate(today)}\n\n## Topic\n${topic}\n\n## Attendees\n${attendees.map(id => `- ${AGENT_META[id]?.name || id}`).join('\n')}\n\n---\n\n`;
    await writeFile(filePath, header, 'utf-8');

    // Return immediately with ID so client can connect to SSE stream
    res.json({ success: true, id: standupId, filename, content: header });

    // Run async orchestration
    runStandupOrchestration(standupId, topic, attendees, filePath).catch(err => {
      console.error('Standup orchestration error:', err);
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create standup', details: err.message });
  }
});

async function runStandupOrchestration(standupId, topic, attendees, filePath) {
  const broadcast = (evt) => {
    const payload = 'data: ' + JSON.stringify(evt) + '\n\n';
    const clients = standupStreamClients.get(standupId);
    if (clients) for (const c of clients) { try { c.write(payload); } catch {} }
  };

  const responses = [];
  for (const agentId of attendees) {
    const meta = AGENT_META[agentId];
    if (!meta) continue;
    broadcast({ type: 'thinking', agentId, agentName: meta.name });
    try {
      const prompt = responses.length === 0
        ? `Topic: ${topic}\n\nPlease give your standup update. Be concise — 2-4 sentences covering what you're working on, any blockers, and your priorities.`
        : `Topic: ${topic}\n\nPrior updates:\n${responses.map(r => `**${r.name}**: ${r.text}`).join('\n\n')}\n\nPlease give your standup update building on what others said.`;
      const { stdout } = await execFileAsync('openclaw', ['agent', '--agent', resolveAgentId(agentId), '--message', prompt, '--json', '--timeout', '90'], { timeout: 100000, maxBuffer: 5*1024*1024 });
      let responseText = stdout.trim();
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.result?.payloads?.[0]) responseText = parsed.result.payloads[0].text || responseText;
        else if (parsed.response) responseText = parsed.response;
      } catch {}
      responses.push({ agentId, name: meta.name, text: responseText });
      broadcast({ type: 'response', agentId, agentName: meta.name, content: responseText });
      await writeFile(filePath, `## ${meta.name} (${meta.role})\n\n${responseText}\n\n---\n\n`, { flag: 'a' });
    } catch (err) {
      broadcast({ type: 'error', agentId, agentName: meta?.name || agentId, content: `Failed to get response: ${err.message}` });
    }
  }

  // Write summary placeholder
  await writeFile(filePath, `## Summary\n\n*Standup complete — ${attendees.length} agents participated.*\n`, { flag: 'a' });
  broadcast({ type: 'complete', standupId, summary: `Standup complete with ${attendees.length} agents.` });

  // Cleanup clients after 60s
  setTimeout(() => standupStreamClients.delete(standupId), 60000);
}

app.get('/api/standups/stream/:id', (req, res) => {
  const { id } = req.params;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('data: ' + JSON.stringify({ type: 'connected', id }) + '\n\n');
  if (!standupStreamClients.has(id)) standupStreamClients.set(id, new Set());
  standupStreamClients.get(id).add(res);
  req.on('close', () => {
    const clients = standupStreamClients.get(id);
    if (clients) { clients.delete(res); if (clients.size === 0) standupStreamClients.delete(id); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NEW WAR ROOM ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── System Pulse: in-memory metrics history (10min rolling) ────────────────
const METRICS_HISTORY = { cpu: [], memory: [], timestamps: [] };
const MAX_SAMPLES = 60; // 60 samples × 10s = 10 minutes

function sampleMetrics() {
  try {
    // CPU usage delta from /proc/stat
    let cpuPct = 0;
    try {
      const cpuOut = execSync("grep '^cpu ' /proc/stat", { encoding: 'utf8', timeout: 2000 }).trim();
      const parts = cpuOut.split(/\s+/).slice(1).map(Number);
      const idle = parts[3] + (parts[4] || 0);
      const total = parts.reduce((a, b) => a + b, 0);
      if (global._lastCpuPulse) {
        const dIdle = idle - global._lastCpuPulse.idle;
        const dTotal = total - global._lastCpuPulse.total;
        cpuPct = dTotal > 0 ? Math.round((1 - dIdle / dTotal) * 100) : 0;
      }
      global._lastCpuPulse = { idle, total };
    } catch { cpuPct = 0; }

    // Memory usage %
    const totalMem = totalmem();
    const freeMem = freemem();
    const memPct = Math.round(((totalMem - freeMem) / totalMem) * 100);

    METRICS_HISTORY.cpu.push(cpuPct);
    METRICS_HISTORY.memory.push(memPct);
    METRICS_HISTORY.timestamps.push(Date.now());

    // Trim to circular buffer size
    if (METRICS_HISTORY.cpu.length > MAX_SAMPLES) {
      METRICS_HISTORY.cpu.shift();
      METRICS_HISTORY.memory.shift();
      METRICS_HISTORY.timestamps.shift();
    }
  } catch (err) {
    console.error('Metrics sample error:', err.message);
  }
}

// Sample immediately on startup, then every 10s
sampleMetrics();
setInterval(sampleMetrics, 10_000);

// GET /api/health/history — rolling CPU & memory sparkline data
app.get('/api/health/history', (req, res) => {
  res.json({
    cpu: [...METRICS_HISTORY.cpu],
    memory: [...METRICS_HISTORY.memory],
    timestamps: [...METRICS_HISTORY.timestamps],
  });
});

// GET /api/health — Full system health (gateway + hardware + services)
app.get('/api/health', async (req, res) => {
  try {
    // Gateway status
    let gatewayStatus = 'offline';
    let agentCount = 0;
    try {
      const statusData = await cachedExec('openclaw', ['status', '--json'], 'status');
      gatewayStatus = 'online';
      agentCount = statusData.heartbeat?.agents?.length || 0;
    } catch { /* gateway down */ }

    // CPU usage (average over all cores from /proc/stat)
    let cpuUsage = 0;
    try {
      const cpuOut = execSync("grep '^cpu ' /proc/stat", { encoding: 'utf8', timeout: 2000 }).trim();
      const parts = cpuOut.split(/\s+/).slice(1).map(Number);
      const idle = parts[3] + (parts[4] || 0);
      const total = parts.reduce((a, b) => a + b, 0);
      // Compare with cached previous reading for delta
      if (global._lastCpu) {
        const dIdle = idle - global._lastCpu.idle;
        const dTotal = total - global._lastCpu.total;
        cpuUsage = dTotal > 0 ? Math.round((1 - dIdle / dTotal) * 100) : 0;
      }
      global._lastCpu = { idle, total };
    } catch { cpuUsage = 0; }

    // Memory
    const totalMem = totalmem();
    const freeMem = freemem();
    const usedMem = totalMem - freeMem;

    // Disk usage
    let diskInfo = { total: 0, used: 0, free: 0, percent: 0 };
    try {
      const dfOut = execSync("df -B1 / | tail -1", { encoding: 'utf8', timeout: 2000 }).trim();
      const dfParts = dfOut.split(/\s+/);
      diskInfo = {
        total: parseInt(dfParts[1]) || 0,
        used: parseInt(dfParts[2]) || 0,
        free: parseInt(dfParts[3]) || 0,
        percent: parseInt(dfParts[4]) || 0,
      };
    } catch { /* silent */ }

    // Uptime formatted
    const uptimeSec = osUptime();
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const uptimeFormatted = days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m`;

    // Services check (systemd user units)
    let services = [];
    try {
      const svcList = ['openclaw-gateway.service', 'signal-cli-rest-api.service'];
      for (const svc of svcList) {
        try {
          const svcOut = execSync(`systemctl --user show ${svc} --property=ActiveState,SubState --no-pager 2>/dev/null`, { encoding: 'utf8', timeout: 2000 });
          const activeMatch = svcOut.match(/ActiveState=(\w+)/);
          const subMatch = svcOut.match(/SubState=(\w+)/);
          const svcUptime = execSync(`systemctl --user show ${svc} --property=ActiveEnterTimestamp --no-pager 2>/dev/null`, { encoding: 'utf8', timeout: 2000 });
          const tsMatch = svcUptime.match(/ActiveEnterTimestamp=(.+)/);
          let runningSince = '';
          if (tsMatch && tsMatch[1].trim()) {
            const started = new Date(tsMatch[1].trim());
            const diffMs = Date.now() - started.getTime();
            const diffH = Math.floor(diffMs / 3600000);
            const diffM = Math.floor((diffMs % 3600000) / 60000);
            runningSince = diffH > 24 ? `${Math.floor(diffH/24)}d ${diffH%24}h` : `${diffH}h ${diffM}m`;
          }
          services.push({
            name: svc.replace('.service', ''),
            status: activeMatch?.[1] || 'unknown',
            uptime: runningSince,
          });
        } catch {
          services.push({ name: svc.replace('.service', ''), status: 'inactive', uptime: '' });
        }
      }
      // Also check docker services
      try {
        const dockerPs = execSync("docker ps --format '{{.Names}}|{{.Status}}' 2>/dev/null", { encoding: 'utf8', timeout: 3000 });
        for (const line of dockerPs.trim().split('\n').filter(Boolean)) {
          const [name, status] = line.split('|');
          if (name) {
            services.push({
              name: name,
              status: status?.includes('Up') ? 'active' : 'inactive',
              uptime: status?.replace(/^Up /, '') || '',
            });
          }
        }
      } catch { /* no docker */ }
    } catch { /* silent */ }

    const cpuInfo = cpus();
    res.json({
      // Legacy fields for Bridge Mode TopBar compatibility
      gateway: gatewayStatus,
      version: '1.0.0',
      agentCount,
      // Full system health for Health page
      cpu: {
        model: cpuInfo[0]?.model || 'Unknown',
        cores: cpuInfo.length,
        usage: cpuUsage,
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percent: Math.round((usedMem / totalMem) * 100),
      },
      disk: diskInfo,
      uptime: {
        seconds: uptimeSec,
        formatted: uptimeFormatted,
      },
      system: {
        hostname: hostname(),
        platform: platform(),
        release: release(),
        arch: arch(),
        nodeVersion: process.version,
      },
      services,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      gateway: 'error',
      uptime: { seconds: osUptime(), formatted: '?' },
      version: '1.0.0',
      agentCount: 0,
      error: err.message,
      system: { hostname: hostname(), platform: platform(), release: release(), arch: arch(), nodeVersion: process.version },
      cpu: { model: 'Unknown', cores: 0, usage: 0 },
      memory: { total: 0, used: 0, free: 0, percent: 0 },
      disk: { total: 0, used: 0, free: 0, percent: 0 },
      services: [],
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/agents — List all agents with status
app.get('/api/agents', async (req, res) => {
  try {
    const configData = await readFile(OPENCLAW_CONFIG, 'utf-8');
    const config = JSON.parse(configData);

    // Get status data for heartbeat/agent info
    let statusData = null;
    try {
      statusData = await cachedExec('openclaw', ['status', '--json'], 'status');
    } catch { /* gateway might be down */ }

    // Get session data for activity info
    let sessionsData = null;
    try {
      sessionsData = await cachedExec(
        'openclaw', ['sessions', '--all-agents', '--json'], 'sessions-all'
      );
    } catch { /* might fail */ }

    // Build agent list from heartbeat agents, fallback to WORKSPACES keys
    // Known valid agents (filter out stale/renamed agents)
    const VALID_AGENTS = new Set(Object.keys(AGENT_META));
    let heartbeatAgents = (statusData?.heartbeat?.agents || [])
      .filter(ha => VALID_AGENTS.has(ha.agentId));
    
    // Deduplicate: if both main and tim exist, keep only main
    const hasMain = heartbeatAgents.some(ha => ha.agentId === 'main');
    if (hasMain) {
      heartbeatAgents = heartbeatAgents.filter(ha => ha.agentId !== 'tim');
    }

    if (heartbeatAgents.length === 0) {
      heartbeatAgents = Object.keys(WORKSPACES)
        .filter(k => k !== 'tim')
        .map(k => ({ agentId: k, enabled: ENABLED_AGENTS.has(k), every: null }));
    }
    const agents = heartbeatAgents.map(ha => {
      const agentId = ha.agentId;
      // Override heartbeat enabled flag with ENABLED_AGENTS whitelist
      const isEnabled = ENABLED_AGENTS.has(agentId);
      const workspace = WORKSPACES[agentId] || null;

      // Find latest session for this agent
      let latestSession = null;
      if (sessionsData?.sessions) {
        const agentSessions = sessionsData.sessions.filter(s => s.agentId === agentId);
        if (agentSessions.length > 0) {
          latestSession = agentSessions.reduce((a, b) =>
            (a.updatedAt || 0) > (b.updatedAt || 0) ? a : b
          );
        }
      }

      // Determine status: if heartbeat enabled and has recent session, it's active
      let status = 'idle';
      if (isAgentRecentlyStopped(agentId)) {
        // Agent was recently stopped — force idle regardless of session age
        status = 'idle';
      } else {
        if (isEnabled) {
          status = 'active';
        }
        if (latestSession) {
          const ageMinutes = (latestSession.ageMs || Infinity) / (1000 * 60);
          if (ageMinutes < 5) status = 'busy';
        }
      }

      const meta = AGENT_META[agentId] || { name: agentId, role: 'Agent', emoji: '🤖' };
      const agentSessions = sessionsData?.sessions?.filter(s => s.agentId === agentId) || [];

      return {
        id: agentId,
        agentId,
        name: meta.name,
        role: meta.role,
        emoji: meta.emoji,
        enabled: isEnabled,
        workspace,
        model: latestSession?.model || config.agents?.defaults?.model?.primary || null,
        status,
        lastActivity: latestSession?.updatedAt || null,
        totalTokens: latestSession?.totalTokens || 0,
        sessionCount: agentSessions.length,
      };
    });

    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list agents', details: err.message });
  }
});

// GET /api/agents/:id/sessions — Sessions for a specific agent
app.get('/api/agents/:id/sessions', async (req, res) => {
  const { id } = req.params;
  try {
    const data = await cachedExec(
      'openclaw', ['sessions', '--agent', id, '--json'], `sessions-${id}`
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get sessions', details: err.message });
  }
});


// GET /api/costs/debug — Debug endpoint to verify cost calculation
app.get('/api/costs/debug', async (req, res) => {
  try {
    const runs = await readAllCronRuns();
    const debugRuns = runs
      .filter(r => r.action === 'finished' && r.usage)
      .slice(-20)
      .map(r => {
        const modelKey = normalizeModelName(r.model);
        const rates = PRICING[modelKey];
        const inputTokens = r.usage.input_tokens || 0;
        const outputTokens = r.usage.output_tokens || 0;
        const totalTokens = r.usage.total_tokens || 0;
        const thinkingTokens = totalTokens > inputTokens + outputTokens
          ? totalTokens - inputTokens - outputTokens : 0;
        return {
          model: r.model,
          normalizedModel: modelKey,
          provider: r.provider,
          agent: r.sessionKey ? r.sessionKey.split(':')[1] : 'unknown',
          hasRates: !!rates,
          rates: rates || null,
          tokens: { input: inputTokens, output: outputTokens, total: totalTokens, thinking: thinkingTokens },
          cost: calculateRunCost(r),
          ts: r.ts,
        };
      });
    res.json({ runs: debugRuns, pricingKeys: Object.keys(PRICING) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/costs/summary — Cost summary with breakdowns
app.get('/api/costs/summary', async (req, res) => {
  try {
    const runs = await readAllCronRuns();
    const summary = computeCostSummary(runs);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute costs', details: err.message });
  }
});

// GET /api/costs/by-agent — Per-agent cost breakdown
app.get('/api/costs/by-agent', async (req, res) => {
  try {
    const runs = await readAllCronRuns();
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthMs = startOfMonth.getTime();

    const agentCosts = {};

    for (const run of runs) {
      if (run.action !== 'finished') continue;
      const cost = calculateRunCost(run);
      if (cost === 0) continue;

      let agentId = 'unknown';
      if (run.sessionKey) {
        const parts = run.sessionKey.split(':');
        if (parts.length >= 2) agentId = parts[1];
      }

      if (!agentCosts[agentId]) {
        agentCosts[agentId] = {
          agentId,
          totalCost: 0,
          todayCost: 0,
          monthCost: 0,
          runCount: 0,
          lastRun: null,
          byModel: {},
        };
      }

      const ac = agentCosts[agentId];
      ac.totalCost += cost;
      ac.runCount += 1;
      if ((run.ts || 0) >= todayMs) ac.todayCost += cost;
      if ((run.ts || 0) >= monthMs) ac.monthCost += cost;
      if (!ac.lastRun || (run.ts || 0) > ac.lastRun) ac.lastRun = run.ts;

      const modelKey = normalizeModelName(run.model);
      ac.byModel[modelKey] = (ac.byModel[modelKey] || 0) + cost;
    }

    res.json(Object.values(agentCosts));
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute agent costs', details: err.message });
  }
});

// GET /api/activity — Recent cron run activity log
app.get('/api/activity', async (req, res) => {
  try {
    const allRuns = await readAllCronRuns();
    const finished = allRuns
      .filter(r => r.action === 'finished')
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 100)
      .map(r => {
        let agentId = 'unknown';
        if (r.sessionKey) {
          const m = r.sessionKey.match(/^agent:([^:]+):/);
          if (m) agentId = m[1];
        }
        return {
          ts: r.ts,
          jobId: r.jobId,
          agentId,
          status: r.status,
          error: r.error || null,
          summary: r.summary || null,
          durationMs: r.durationMs || 0,
          model: r.model || null,
          provider: r.provider || null,
          usage: r.usage || null,
        };
      });
    res.json(finished);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read activity', details: err.message });
  }
});

// GET /api/cron/jobs — All cron jobs with last run status
app.get('/api/cron/jobs', async (req, res) => {
  try {
    const jobsRaw = await readFile(CRON_JOBS_FILE, 'utf-8');
    const jobsData = JSON.parse(jobsRaw);
    const jobs = jobsData.jobs || [];

    // For each job, read the last line of its run file
    const enrichedJobs = await Promise.all(
      jobs.map(async (job) => {
        let lastRun = null;
        const runFile = join(CRON_RUNS_DIR, `${job.id}.jsonl`);
        try {
          const content = await readFile(runFile, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim());
          if (lines.length > 0) {
            lastRun = JSON.parse(lines[lines.length - 1]);
          }
        } catch { /* run file might not exist */ }

        return {
          id: job.id,
          agentId: job.agentId,
          name: job.name,
          description: job.description,
          enabled: job.enabled,
          schedule: job.schedule,
          delivery: job.delivery,
          state: job.state,
          lastRun,
          lastError: job.lastError || null,
          consecutiveErrors: job.consecutiveErrors || 0,
        };
      })
    );

    res.json(enrichedJobs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read cron jobs', details: err.message });
  }
});

// GET /api/alerts — Active alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const alerts = await generateAlerts();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate alerts', details: err.message });
  }
});

// GET /api/events — SSE endpoint for real-time updates
app.get('/api/events', (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);

  // Add client to SSE set
  sseClients.add(res);

  // Remove on disconnect
  req.on('close', () => {
    sseClients.delete(res);
  });
});

// SSE polling cycle — runs every 10 seconds
let sseInterval = null;

async function ssePollCycle() {
  if (sseClients.size === 0) return;

  try {
    // 1. Get agent/session data
    let agentsPayload = [];
    try {
      const sessionsData = await cachedExec(
        'openclaw', ['sessions', '--all-agents', '--json'], 'sessions-all'
      );
      if (sessionsData?.sessions) {
        // Group by agent
        const byAgent = {};
        for (const s of sessionsData.sessions) {
          const aid = s.agentId || 'unknown';
          if (!byAgent[aid]) byAgent[aid] = [];
          byAgent[aid].push(s);
        }
        agentsPayload = Object.entries(byAgent).map(([agentId, sessions]) => ({
          agentId,
          sessionCount: sessions.length,
          latestSession: sessions.reduce((a, b) =>
            (a.updatedAt || 0) > (b.updatedAt || 0) ? a : b
          ),
        }));
      }
    } catch { /* ignore */ }

    // 2. Calculate costs
    let costsPayload = {};
    try {
      const runs = await readAllCronRuns();
      costsPayload = computeCostSummary(runs);
    } catch { /* ignore */ }

    // 3. Generate alerts
    let alertsPayload = [];
    try {
      alertsPayload = await generateAlerts();
    } catch { /* ignore */ }

    // Send to all connected clients
    const events = [
      { type: 'agents', data: agentsPayload },
      { type: 'costs', data: costsPayload },
      { type: 'alerts', data: alertsPayload },
    ];

    for (const client of sseClients) {
      try {
        for (const event of events) {
          client.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch {
        // Client probably disconnected
        sseClients.delete(client);
      }
    }
  } catch (err) {
    console.error('SSE poll cycle error:', err.message);
  }
}


// ======================================================================
// DRILL MODE ENDPOINTS
// ======================================================================

// GET /api/agents/:id/memory - List memory entries for an agent
app.get('/api/agents/:id/memory', async (req, res) => {
  const { id } = req.params;
  const workspacePath = WORKSPACES[id.toLowerCase()];
  if (!workspacePath) {
    return res.status(404).json({ error: 'Unknown agent' });
  }

  const memoryDir = join(workspacePath, 'memory');
  try {
    if (!existsSync(memoryDir)) {
      return res.json([]);
    }
    const entries = await readdir(memoryDir, { withFileTypes: true });
    const memoryFiles = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = join(memoryDir, entry.name);
        const raw = await readFile(filePath, 'utf-8');
        const preview = raw.substring(0, 500);

        // Try to extract a date from the filename (e.g. 2026-02-28-topic.md)
        const dateMatch = entry.name.match(/^(\d{4}-\d{2}-\d{2})/);
        let date = null;
        if (dateMatch) {
          date = dateMatch[1];
        } else {
          // Fallback: use file mtime
          const stats = await stat(filePath);
          date = stats.mtime.toISOString().split('T')[0];
        }

        memoryFiles.push({
          filename: entry.name,
          date,
          content: preview,
          fullPath: filePath,
        });
      }
    }

    // Sort by date descending (newest first)
    memoryFiles.sort((a, b) => b.date.localeCompare(a.date));
    res.json(memoryFiles);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read memory', details: err.message });
  }
});

// GET /api/agents/:id/memory/:filename - Read a specific memory file
app.get('/api/agents/:id/memory/:filename', async (req, res) => {
  const { id, filename } = req.params;
  const workspacePath = WORKSPACES[id.toLowerCase()];
  if (!workspacePath) {
    return res.status(404).json({ error: 'Unknown agent' });
  }

  try {
    const filePath = join(workspacePath, 'memory', filename);
    const resolvedPath = resolve(filePath);
    const memoryDir = join(workspacePath, 'memory');
    if (!resolvedPath.startsWith(memoryDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const rawContent = await readFile(resolvedPath, 'utf-8');
    res.json({ filename, content: rawContent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read memory file', details: err.message });
  }
});

// GET /api/agents/:id/costs - Per-agent cost breakdown
app.get('/api/agents/:id/costs', async (req, res) => {
  const { id } = req.params;
  try {
    const allRuns = await readAllCronRuns();
    // Filter runs where sessionKey contains the agent id
    const agentRuns = allRuns.filter(
      (r) => r.action === 'finished' && r.sessionKey && r.sessionKey.includes('agent:' + id + ':')
    );

    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const weekMs = startOfWeek.getTime();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthMs = startOfMonth.getTime();

    let today = 0;
    let thisWeek = 0;
    let thisMonth = 0;
    let total = 0;
    const byModel = {};
    const recentRuns = [];

    for (const run of agentRuns) {
      const cost = calculateRunCost(run);
      const ts = run.ts || 0;
      total += cost;
      if (ts >= todayMs) today += cost;
      if (ts >= weekMs) thisWeek += cost;
      if (ts >= monthMs) thisMonth += cost;

      const modelKey = normalizeModelName(run.model);
      byModel[modelKey] = (byModel[modelKey] || 0) + cost;

      recentRuns.push({
        ts: run.ts,
        model: normalizeModelName(run.model),
        cost,
        durationMs: run.durationMs || 0,
        status: run.status || 'unknown',
      });
    }

    // Sort runs by timestamp descending, take last 20
    recentRuns.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const runs = recentRuns.slice(0, 20);

    res.json({ today, thisWeek, thisMonth, total, byModel, runs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute agent costs', details: err.message });
  }
});

// GET /api/agents/:id/cron - Cron jobs for a specific agent
app.get('/api/agents/:id/cron', async (req, res) => {
  const { id } = req.params;
  try {
    const jobsRaw = await readFile(CRON_JOBS_FILE, 'utf-8');
    const jobsData = JSON.parse(jobsRaw);
    const allJobs = jobsData.jobs || [];

    // Filter jobs by agentId
    const agentJobs = allJobs.filter((j) => j.agentId === id);

    // Enrich each job with its last run data
    const enrichedJobs = await Promise.all(
      agentJobs.map(async (job) => {
        let lastRun = null;
        const runFile = join(CRON_RUNS_DIR, job.id + '.jsonl');
        try {
          const rawContent = await readFile(runFile, 'utf-8');
          const lines = rawContent.split('\n').filter((l) => l.trim());
          if (lines.length > 0) {
            lastRun = JSON.parse(lines[lines.length - 1]);
          }
        } catch {
          /* run file might not exist */
        }

        return {
          id: job.id,
          agentId: job.agentId,
          name: job.name,
          description: job.description,
          enabled: job.enabled,
          schedule: job.schedule,
          delivery: job.delivery,
          state: job.state,
          lastRun,
          lastError: job.lastError || null,
          consecutiveErrors: job.consecutiveErrors || 0,
        };
      })
    );

    res.json(enrichedJobs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read cron jobs', details: err.message });
  }
});

// GET /api/agents/:id/workspace - Full workspace file tree (max depth 3)
app.get('/api/agents/:id/workspace', async (req, res) => {
  const { id } = req.params;
  const workspacePath = WORKSPACES[id.toLowerCase()];
  if (!workspacePath) {
    return res.status(404).json({ error: 'Unknown agent' });
  }

  async function buildTree(dirPath, currentDepth, maxDepth) {
    if (currentDepth > maxDepth) return [];
    const children = [];
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        // Skip hidden files/dirs
        if (entry.name.startsWith('.')) continue;
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          const subChildren = await buildTree(fullPath, currentDepth + 1, maxDepth);
          children.push({
            name: entry.name,
            type: 'dir',
            children: subChildren,
          });
        } else if (entry.isFile()) {
          try {
            const stats = await stat(fullPath);
            children.push({
              name: entry.name,
              type: 'file',
              size: stats.size,
            });
          } catch {
            children.push({
              name: entry.name,
              type: 'file',
              size: 0,
            });
          }
        }
      }
    } catch {
      /* directory might not be readable */
    }
    return children;
  }

  try {
    const tree = await buildTree(workspacePath, 1, 3);
    res.json({
      agent: id,
      path: workspacePath,
      tree,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build workspace tree', details: err.message });
  }
});



// ═══════════════════════════════════════════════════════════════════════════════
// FORGE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/forge/roles — Available C-suite roles
app.get("/api/forge/roles", async (req, res) => {
  try {
    const data = await readFile(join(__dirname, "src", "server", "data", "roles.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: "Failed to read roles", details: err.message });
  }
});

// GET /api/forge/archetypes — Leadership archetypes by role
app.get("/api/forge/archetypes", async (req, res) => {
  try {
    const data = await readFile(join(__dirname, "src", "server", "data", "archetypes.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: "Failed to read archetypes", details: err.message });
  }
});

// GET /api/forge/archetypes/:roleId — Archetypes for a specific role
app.get("/api/forge/archetypes/:roleId", async (req, res) => {
  try {
    const data = await readFile(join(__dirname, "src", "server", "data", "archetypes.json"), "utf-8");
    const allArchetypes = JSON.parse(data);
    const roleArchetypes = allArchetypes[req.params.roleId];
    if (!roleArchetypes) {
      return res.status(404).json({ error: "Unknown role" });
    }
    res.json(roleArchetypes);
  } catch (err) {
    res.status(500).json({ error: "Failed to read archetypes", details: err.message });
  }
});

// GET /api/forge/traits — Trait descriptor data
app.get("/api/forge/traits", async (req, res) => {
  try {
    const data = await readFile(join(__dirname, "src", "server", "data", "trait-descriptors.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: "Failed to read traits", details: err.message });
  }
});

// POST /api/forge/preview-soul — Preview generated SOUL.md from wizard inputs
app.post("/api/forge/preview-soul", async (req, res) => {
  try {
    const { agentName, roleId, archetypeId, traits, companyName } = req.body;
    
    // Load template and data
    const [templateData, archetypeData, traitData, roleData] = await Promise.all([
      readFile(join(__dirname, "src", "server", "data", "templates.json"), "utf-8"),
      readFile(join(__dirname, "src", "server", "data", "archetypes.json"), "utf-8"),
      readFile(join(__dirname, "src", "server", "data", "trait-descriptors.json"), "utf-8"),
      readFile(join(__dirname, "src", "server", "data", "roles.json"), "utf-8"),
    ]);
    
    const templates = JSON.parse(templateData);
    const archetypes = JSON.parse(archetypeData);
    const traitDescriptors = JSON.parse(traitData);
    const roles = JSON.parse(roleData);
    
    const role = roles.find(r => r.id === roleId);
    const archetype = (archetypes[roleId] || []).find(a => a.id === archetypeId);
    
    if (!role || !archetype) {
      return res.status(400).json({ error: "Invalid role or archetype" });
    }
    
    // Get trait descriptors for the given trait values
    function getTraitDesc(traitKey, value) {
      const trait = traitDescriptors[traitKey];
      if (!trait) return "";
      for (const [range, desc] of Object.entries(trait.soulDescriptors)) {
        const [lo, hi] = range.split("-").map(Number);
        if (value >= lo && value <= hi) return desc;
      }
      return "";
    }
    
    // Build SOUL.md from template
    let soul = templates.soul;
    const replacements = {
      "{{agentName}}": agentName || archetype.name,
      "{{roleTitle}}": role.title,
      "{{roleShortTitle}}": role.shortTitle,
      "{{companyName}}": companyName || "NetSmith",
      "{{archetypeQuote}}": archetype.description,
      "{{archetypeSoulPrompt}}": archetype.soulPrompt,
      "{{communicationDescriptor}}": getTraitDesc("communication", traits?.communication ?? 0.5),
      "{{riskDescriptor}}": getTraitDesc("riskTolerance", traits?.riskTolerance ?? 0.5),
      "{{decisionDescriptor}}": getTraitDesc("decisionStyle", traits?.decisionStyle ?? 0.5),
      "{{responsibilities}}": role.coreResponsibilities.map(r => "- " + r).join("\n"),
      "{{roleDomain}}": role.shortTitle + " operations",
      "{{delegationRules}}": "Defined by organizational structure.",
      "{{generatedDate}}": new Date().toISOString().split("T")[0],
    };
    
    for (const [key, val] of Object.entries(replacements)) {
      soul = soul.split(key).join(val);
    }
    
    res.json({ preview: soul, archetype: archetype.name, role: role.title });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate preview", details: err.message });
  }
});



// POST /api/forge/deploy — Deploy a new agent from wizard configuration
app.post("/api/forge/deploy", async (req, res) => {
  try {
    const { agentName, agentId, roleId, archetypeId, traits, companyName, modelTier, channels } = req.body;
    
    if (!agentName || !agentId || !roleId) {
      return res.status(400).json({ error: "Missing required fields: agentName, agentId, roleId" });
    }

    // Load all data files
    const [templateData, archetypeData, traitData, roleData] = await Promise.all([
      readFile(join(__dirname, "src", "server", "data", "templates.json"), "utf-8"),
      readFile(join(__dirname, "src", "server", "data", "archetypes.json"), "utf-8"),
      readFile(join(__dirname, "src", "server", "data", "trait-descriptors.json"), "utf-8"),
      readFile(join(__dirname, "src", "server", "data", "roles.json"), "utf-8"),
    ]);
    
    const templates = JSON.parse(templateData);
    const archetypes = JSON.parse(archetypeData);
    const traitDescriptors = JSON.parse(traitData);
    const roles = JSON.parse(roleData);
    
    const role = roles.find(r => r.id === roleId);
    const archetype = (archetypes[roleId] || []).find(a => a.id === archetypeId);
    
    if (!role) {
      return res.status(400).json({ error: "Invalid role: " + roleId });
    }
    
    // Get trait descriptors
    function getTraitDesc(traitKey, value) {
      const trait = traitDescriptors[traitKey];
      if (!trait) return "";
      for (const [range, desc] of Object.entries(trait.soulDescriptors)) {
        const [lo, hi] = range.split("-").map(Number);
        if (value >= lo && value <= hi) return desc;
      }
      return "";
    }

    const dateStr = new Date().toISOString().split("T")[0];

    // Generate SOUL.md
    let soul = templates.soul;
    const soulReplacements = {
      "{{agentName}}": agentName,
      "{{roleTitle}}": role.title,
      "{{roleShortTitle}}": role.shortTitle,
      "{{companyName}}": companyName || "NetSmith",
      "{{archetypeQuote}}": archetype ? archetype.description : role.description,
      "{{archetypeSoulPrompt}}": archetype ? archetype.soulPrompt : "You embody the " + role.title + " with excellence.",
      "{{communicationDescriptor}}": getTraitDesc("communication", traits?.communication ?? 0.5),
      "{{riskDescriptor}}": getTraitDesc("riskTolerance", traits?.riskTolerance ?? 0.5),
      "{{decisionDescriptor}}": getTraitDesc("decisionStyle", traits?.decisionStyle ?? 0.5),
      "{{responsibilities}}": role.coreResponsibilities.map(r => "- " + r).join("\n"),
      "{{roleDomain}}": role.shortTitle + " operations",
      "{{delegationRules}}": "Defined by organizational structure.",
      "{{generatedDate}}": dateStr,
    };
    for (const [key, val] of Object.entries(soulReplacements)) {
      soul = soul.split(key).join(val);
    }

    // Generate IDENTITY.md  
    const modelMap = { performance: "Claude Opus 4", balanced: "Claude Sonnet 4.6", economy: "Gemini 2.5 Flash" };
    let identity = templates.identity;
    const identityReplacements = {
      "{{agentName}}": agentName,
      "{{roleTitle}}": role.title,
      "{{roleShortTitle}}": role.shortTitle,
      "{{agentId}}": agentId,
      "{{modelName}}": modelMap[modelTier] || modelMap[role.modelTier] || "Claude Sonnet 4.6",
      "{{reportsTo}}": "CEO (Human)",
      "{{directReports}}": "—",
      "{{companyName}}": companyName || "NetSmith",
      "{{archetypeName}}": archetype ? archetype.name : "Custom",
      "{{archetypeLabel}}": archetype ? archetype.label : "Custom",
      "{{channels}}": channels ? Object.entries(channels).filter(([_,v]) => v).map(([k]) => "- " + k).join("\n") || "None configured" : "None configured",
      "{{dailyTokenLimit}}": "500,000",
      "{{modelTier}}": modelTier || role.modelTier || "balanced",
      "{{monthlyBudget}}": "TBD",
      "{{generatedDate}}": dateStr,
    };
    for (const [key, val] of Object.entries(identityReplacements)) {
      identity = identity.split(key).join(val);
    }

    // Create workspace directory
    const workspaceDir = join(HOME, "steelclaw", "workspace-" + agentId);
    await mkdir(workspaceDir, { recursive: true });
    await mkdir(join(workspaceDir, "memory"), { recursive: true });

    // Write files
    await writeFile(join(workspaceDir, "SOUL.md"), soul, "utf-8");
    await writeFile(join(workspaceDir, "IDENTITY.md"), identity, "utf-8");
    await writeFile(join(workspaceDir, "MEMORY.md"), "# MEMORY.md\n\nNo memories yet. Start a conversation to build institutional knowledge.\n", "utf-8");

    // Update WORKSPACES runtime map
    WORKSPACES[agentId] = workspaceDir;

    res.json({
      success: true,
      agentId,
      workspace: workspaceDir,
      files: ["SOUL.md", "IDENTITY.md", "MEMORY.md"],
      message: agentName + " has been deployed as " + role.title,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to deploy agent", details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}




// ═══════════════════════════════════════════════════════════════════════════════
// AI FLEET ENDPOINT — All AI capabilities grouped by type
// ═══════════════════════════════════════════════════════════════════════════════

function modelCost(shortName) {
  const s = (shortName || '').toLowerCase();
  if (s.includes('opus')) return '$15/1M in · $75/1M out';
  if (s.includes('sonnet')) return '$3/1M in · $15/1M out';
  if (s.includes('haiku')) return '$0.25/1M in · $1.25/1M out';
  if (s.includes('gpt-4o-mini')) return '$0.15/1M in · $0.60/1M out';
  if (s.includes('gpt-4o')) return '$2.50/1M in · $10/1M out';
  if (s.includes('gemini-2.5-pro')) return '$1.25/1M in · $10/1M out';
  if (s.includes('gemini-2.5-flash')) return '$0.15/1M in · $0.60/1M out';
  if (s.includes('gemini-2.0-flash')) return '$0.075/1M in · $0.30/1M out';
  if (s.includes('dall-e')) return '$0.04/image';
  if (s.includes('sora-2-pro')) return '$0.04/sec';
  if (s.includes('sora-2')) return '$0.01/sec';
  if (s.includes('whisper')) return '$0.006/min';
  if (s.includes('tts-1-hd')) return '$30/1M chars';
  if (s.includes('tts-1')) return '$15/1M chars';
  if (s.includes('gpt-4o-audio')) return '$100/1M in';
  if (s.includes('gemini-3-pro-image')) return '$0.04/image';
  if (s.includes('gemini-2.5-flash-image')) return '$0.02/image';
  return 'varies';
}

app.get('/api/fleet', async (req, res) => {
  try {
    const fleet = [];
    const keys = {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      google: !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
      openrouter: !!process.env.OPENROUTER_API_KEY,
    };

    const addAvailable = (name, shortName, purpose, auth, provider, type = 'LLM', cost = 'varies') => {
      fleet.push({ name, shortName, purpose, provider, authMethod: auth, status: 'Available', agents: [], agentCount: 0, cost, type });
    };

    // Active LLM agents from openclaw.json
    let agentsList = [];
    try { agentsList = await getAgentsList(); } catch { /* ignore */ }
    const activeAgentsByModel = {};
    for (const agent of agentsList) {
      const model = agent.model || 'openrouter/auto';
      if (!activeAgentsByModel[model]) activeAgentsByModel[model] = [];
      activeAgentsByModel[model].push(agent.id);
    }
    for (const [model, agents] of Object.entries(activeAgentsByModel)) {
      const shortName = model.split('/').pop() || model;
      const providerRaw = model.includes('anthropic') ? 'anthropic'
        : (model.includes('google') || model.includes('gemini')) ? 'google'
        : (model.includes('openai') || model.includes('gpt')) ? 'openai' : 'openrouter';
      fleet.push({
        name: model, shortName,
        purpose: agents.map(a => AGENT_META[a]?.name || a).join(', '),
        provider: providerRaw, authMethod: 'API key',
        status: 'Active', agents, agentCount: agents.length,
        cost: modelCost(shortName), type: 'LLM',
      });
    }

    // Available LLMs (not yet assigned)
    const activeModelSet = new Set(Object.keys(activeAgentsByModel));
    const availableLLMs = [
      { name: 'anthropic/claude-opus-4-5', short: 'claude-opus-4-5', purpose: 'Flagship reasoning model', provider: 'anthropic', needKey: 'anthropic' },
      { name: 'anthropic/claude-sonnet-4-5', short: 'claude-sonnet-4-5', purpose: 'Balanced performance', provider: 'anthropic', needKey: 'anthropic' },
      { name: 'anthropic/claude-haiku-4-5', short: 'claude-haiku-4-5', purpose: 'Fast & lightweight', provider: 'anthropic', needKey: 'anthropic' },
      { name: 'openai/gpt-4o', short: 'gpt-4o', purpose: 'OpenAI flagship model', provider: 'openai', needKey: 'openai' },
      { name: 'openai/gpt-4o-mini', short: 'gpt-4o-mini', purpose: 'Fast, affordable GPT', provider: 'openai', needKey: 'openai' },
      { name: 'google/gemini-2.5-pro', short: 'gemini-2.5-pro', purpose: 'Google flagship model', provider: 'google', needKey: 'google' },
      { name: 'google/gemini-2.5-flash', short: 'gemini-2.5-flash', purpose: 'Fast Gemini', provider: 'google', needKey: 'google' },
      { name: 'openrouter/auto', short: 'openrouter-auto', purpose: 'Auto-routes to best model', provider: 'openrouter', needKey: 'openrouter' },
    ];
    for (const m of availableLLMs) {
      if (!activeModelSet.has(m.name) && keys[m.needKey]) {
        addAvailable(m.name, m.short, m.purpose, 'API key', m.provider, 'LLM', modelCost(m.short));
      }
    }

    // Image models
    if (keys.google) {
      addAvailable('google/gemini-3-pro-image', 'gemini-3-pro-image', 'Image generation & editing (Nano Banana Pro)', 'API key', 'google', 'Image', '$0.04/image');
      addAvailable('google/gemini-2.5-flash-image', 'gemini-2.5-flash-image', 'Fast image understanding & gen', 'API key', 'google', 'Image', '$0.02/image');
    }
    if (keys.openai) {
      addAvailable('openai/dall-e-3', 'dall-e-3', 'High-quality text-to-image', 'API key', 'openai', 'Image', '$0.04/image');
    }

    // Video models
    if (keys.openai) {
      addAvailable('openai/sora-2', 'sora-2', 'Text-to-video generation', 'API key', 'openai', 'Video', '$0.01/sec');
      addAvailable('openai/sora-2-pro', 'sora-2-pro', 'High-quality video generation', 'API key', 'openai', 'Video', '$0.04/sec');
    }

    // Audio models
    if (keys.openai) {
      addAvailable('openai/whisper-1', 'whisper-1', 'Speech-to-text transcription', 'API key', 'openai', 'Audio', '$0.006/min');
      addAvailable('openai/tts-1', 'tts-1', 'Text-to-speech synthesis', 'API key', 'openai', 'Audio', '$15/1M chars');
      addAvailable('openai/tts-1-hd', 'tts-1-hd', 'High-fidelity TTS', 'API key', 'openai', 'Audio', '$30/1M chars');
      addAvailable('openai/gpt-4o-audio-preview', 'gpt-4o-audio', 'Audio reasoning & generation', 'API key', 'openai', 'Audio', '$100/1M in');
    }

    // Music (Locked — no key)
    fleet.push({
      name: 'suno/v4', shortName: 'suno-v4',
      purpose: 'AI music generation', provider: 'suno',
      authMethod: 'SUNO_API_KEY (not set)', status: 'Locked',
      agents: [], agentCount: 0, cost: '$0.01/song', type: 'Music',
    });

    res.json({ fleet, keys });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build fleet', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGEMENT ENDPOINTS — Model, Thinking, Agent, Cron CRUD
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/models', async (req, res) => {
  try {
    // Use 5-minute cache to avoid slow CLI call on every request
    const cacheKey = '_modelListCache';
    const cacheTTL = 5 * 60 * 1000; // 5 minutes
    if (global[cacheKey] && (Date.now() - global[cacheKey].ts < cacheTTL)) {
      return res.json(global[cacheKey].data);
    }
    const output = execSync('openclaw models list --all --json', { encoding: 'utf8', timeout: 60000 });
    const data = JSON.parse(output);
    // Filter to available models and group by provider
    const models = (data.models || [])
      .filter(m => m.available)
      .map(m => ({
        key: m.key,
        name: m.name,
        provider: m.key.startsWith('openrouter/') ? m.key.split('/')[1] : m.key.split('/')[0],
        contextWindow: m.contextWindow || null,
        reasoning: m.key.includes(':thinking') || m.name.toLowerCase().includes('thinking'),
      }));
    const responseData = { count: models.length, models };
    global[cacheKey] = { ts: Date.now(), data: responseData };
    res.json(responseData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list models', details: err.message });
  }
});

app.patch('/api/agents/:id/model', express.json(), async (req, res) => {
  const { id } = req.params;
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: 'model is required' });
  if (!AGENT_META[id]) return res.status(404).json({ error: 'Unknown agent' });
  
  try {
    // Find the agent's index in the config list
    const agentsList = await getAgentsList();
    const idx = agentsList.findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Agent not found in config' });
    
    await execFileAsync("openclaw", ["config", "set", `agents.list.${idx}.model`, `"${model}"`], { timeout: 10000 });
    // Clear CLI cache so next status fetch reflects the change
    cliCache.clear();
    res.json({ success: true, agentId: id, model });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update model', details: err.message });
  }
});

app.patch('/api/agents/:id/thinking', express.json(), async (req, res) => {
  const { id } = req.params;
  const { level } = req.body; // off, minimal, low, medium, high
  const validLevels = ['off', 'minimal', 'low', 'medium', 'high'];
  if (!level || !validLevels.includes(level)) {
    return res.status(400).json({ error: 'level must be one of: ' + validLevels.join(', ') });
  }
  if (!AGENT_META[id]) return res.status(404).json({ error: 'Unknown agent' });
  
  try {
    // Store thinking level in local prefs file (OpenClaw config doesn't support per-agent thinking)
    await setAgentPref(id, 'thinkingLevel', level);
    res.json({ success: true, agentId: id, thinkingLevel: level });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update thinking level', details: err.message });
  }
});

app.post('/api/agents/:id/stop', async (req, res) => {
  const { id } = req.params;
  if (!AGENT_META[id]) return res.status(404).json({ error: 'Unknown agent' });

  let stopped = false;
  const errors = [];

  // Method 1: Try runs.stop via gateway RPC
  try {
    execSync(`openclaw gateway rpc runs.stop --agent ${id}`, { encoding: 'utf8', timeout: 10000 });
    stopped = true;
  } catch (e) {
    errors.push('runs.stop: ' + (e.message || 'failed'));
  }

  // Method 2: Try canceling active sessions directly
  try {
    const sessOut = execSync(`openclaw sessions --agent ${id} --json`, { encoding: 'utf8', timeout: 10000 });
    const sessData = JSON.parse(sessOut);
    const activeSessions = (sessData.sessions || []).filter(s => {
      const ageMin = (s.ageMs || Infinity) / (1000 * 60);
      return ageMin < 5;
    });
    for (const sess of activeSessions) {
      try {
        execSync(`openclaw session cancel ${sess.sessionId || sess.id} --agent ${id}`, { encoding: 'utf8', timeout: 5000 });
        stopped = true;
      } catch {
        // Individual session cancel may not be supported
      }
    }
  } catch (e) {
    errors.push('session cancel: ' + (e.message || 'failed'));
  }

  // Regardless of whether commands succeeded, mark agent as stopped
  // This overrides the status derivation to show 'idle' immediately
  markAgentStopped(id);
  cliCache.clear();

  res.json({
    success: true,
    agentId: id,
    status: 'idle',
    message: stopped ? 'Agent stopped successfully' : 'Stop signal sent (best-effort)',
    warnings: errors.length > 0 ? errors : undefined
  });
});


app.patch('/api/agents/:id/rename', express.json(), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!AGENT_META[id]) return res.status(404).json({ error: 'Unknown agent' });
  
  try {
    execSync(`openclaw agents set-identity --agent ${id} --name "${name.trim()}"`, { encoding: 'utf8', timeout: 10000 });
    // Update our local metadata
    AGENT_META[id].name = name.trim();
    cliCache.clear();
    res.json({ success: true, agentId: id, name: name.trim() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to rename agent', details: err.message });
  }
});

app.delete('/api/agents/:id', async (req, res) => {
  const { id } = req.params;
  if (id === 'main') return res.status(403).json({ error: 'Cannot delete the main agent' });
  if (!AGENT_META[id]) return res.status(404).json({ error: 'Unknown agent' });
  
  try {
    execSync(`openclaw agents delete ${id} --force --json`, { encoding: 'utf8', timeout: 15000 });
    delete AGENT_META[id];
    delete WORKSPACES[id];
    cliCache.clear();
    res.json({ success: true, agentId: id, message: 'Agent deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete agent', details: err.message });
  }
});

app.post('/api/cron/jobs/:jobId/run', async (req, res) => {
  const { jobId } = req.params;
  try {
    const output = execSync(`openclaw cron run ${jobId}`, { encoding: 'utf8', timeout: 120000 });
    cliCache.clear();
    // cron run returns plain text, not JSON
    res.json({ success: true, jobId, output: output.trim() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to run cron job', details: err.message });
  }
});

app.delete('/api/cron/jobs/:jobId', async (req, res) => {
  const { jobId } = req.params;
  try {
    execSync(`openclaw cron rm ${jobId} --json`, { encoding: 'utf8', timeout: 15000 });
    cliCache.clear();
    res.json({ success: true, jobId, message: 'Cron job deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete cron job', details: err.message });
  }
});

app.post('/api/cron/jobs', express.json(), async (req, res) => {
  const { agentId, name, message, schedule, announce, channel, session, thinking, model } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!message) return res.status(400).json({ error: 'message is required' });
  
  try {
    let cmd = `openclaw cron add --agent ${agentId} --name "${name}" --message "${message.replace(/"/g, '\\"')}"`;
    
    // Schedule: support cron expression, interval, or one-time
    if (schedule) {
      if (schedule.cron) cmd += ` --cron "${schedule.cron}"`;
      else if (schedule.every) cmd += ` --every "${schedule.every}"`;
      else if (schedule.at) cmd += ` --at "${schedule.at}"`;
      if (schedule.tz) cmd += ` --tz "${schedule.tz}"`;
    }
    
    if (announce) cmd += ' --announce';
    if (channel) cmd += ` --channel "${channel}"`;
    if (session) cmd += ` --session ${session}`;
    if (thinking) cmd += ` --thinking ${thinking}`;
    if (model) cmd += ` --model "${model}"`;
    cmd += ' --json';
    
    const output = execSync(cmd, { encoding: 'utf8', timeout: 15000 });
    cliCache.clear();
    let result;
    try { result = JSON.parse(output); } catch { result = { output }; }
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create cron job', details: err.message });
  }
});

app.get('/api/agents/:id/config', async (req, res) => {
  const { id } = req.params;
  if (!AGENT_META[id]) return res.status(404).json({ error: 'Unknown agent' });
  
  try {
    const agentsList = await getAgentsList();
    const agent = agentsList.find(a => a.id === id);
    if (!agent) return res.status(404).json({ error: 'Agent not found in config' });
    
    const thinkingLevel = await getAgentPref(id, 'thinkingLevel', 'off');
    res.json({
      id: agent.id,
      model: agent.model || null,
      thinkingLevel,
      heartbeat: agent.heartbeat || null,
      workspace: agent.workspace || null,
      identity: agent.identity || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get agent config', details: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: CHANNEL & MESSAGE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/channels — list all channels with last message
app.get('/api/channels', (req, res) => {
  try {
    const channels = chatDB.prepare(`
      SELECT c.*, m.content as last_msg_content, m.sender_name as last_msg_sender, m.created_at as last_msg_at
      FROM channels c
      LEFT JOIN messages m ON m.channel_id = c.id AND m.created_at = c.last_message_at
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    `).all();

    const result = channels.map(ch => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      description: ch.description,
      participants: JSON.parse(ch.participants),
      created_at: ch.created_at,
      last_message_at: ch.last_message_at,
      lastMessage: ch.last_msg_content ? {
        content: ch.last_msg_content,
        sender_name: ch.last_msg_sender,
        created_at: ch.last_msg_at,
      } : null,
    }));

    res.json({ channels: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list channels', details: err.message });
  }
});

// POST /api/channels — create a new channel
app.post('/api/channels', (req, res) => {
  try {
    const { name, type, participants, description } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'name and type are required' });
    }
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const now = Date.now();
    chatDB.prepare('INSERT INTO channels (id, name, type, description, participants, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, name, type || 'group', description || null, JSON.stringify(participants || []), now);

    const channel = chatDB.prepare('SELECT * FROM channels WHERE id = ?').get(id);
    res.json({
      ...channel,
      participants: JSON.parse(channel.participants),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create channel', details: err.message });
  }
});

// GET /api/channels/:id/messages — paginated messages (newest first)
app.get('/api/channels/:id/messages', (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before ? parseInt(req.query.before) : null;

    let messages;
    if (before) {
      messages = chatDB.prepare(
        'SELECT * FROM messages WHERE channel_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?'
      ).all(id, before, limit);
    } else {
      messages = chatDB.prepare(
        'SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(id, limit);
    }

    // Return in chronological order (oldest first) for display
    messages.reverse();
    const hasMore = messages.length === limit;

    res.json({ messages, hasMore });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get messages', details: err.message });
  }
});

// POST /api/channels/:id/messages — send a message and get agent response
app.post('/api/channels/:id/messages', async (req, res) => {
  try {
    const { id: channelId } = req.params;
    const { content, parentId } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }

    const channel = chatDB.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const participants = JSON.parse(channel.participants);
    const now = Date.now();

    // Store human message
    const humanMsgId = crypto.randomUUID();
    chatDB.prepare(
      'INSERT INTO messages (id, channel_id, sender_id, sender_name, content, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(humanMsgId, channelId, 'human', 'You', content.trim(), parentId || null, now);

    // Update channel last_message_at
    chatDB.prepare('UPDATE channels SET last_message_at = ? WHERE id = ?').run(now, channelId);

    const humanMsg = {
      id: humanMsgId,
      channel_id: channelId,
      sender_id: 'human',
      sender_name: 'You',
      content: content.trim(),
      parent_id: parentId || null,
      created_at: now,
    };

    // Broadcast human message via SSE
    broadcastChannelMessage(channelId, { type: 'message', message: humanMsg });

    // Determine which agent to route to
    let targetAgent = null;

    if (channel.type === 'direct') {
      // Direct channel: route to the single agent participant
      targetAgent = participants.find(p => p !== 'human') || null;
    } else if (channel.type === 'group') {
      targetAgent = routeGroupMessage(content, participants);
    }

    if (!targetAgent) {
      return res.json({ message: humanMsg, agentResponse: null });
    }

    const meta = AGENT_META[targetAgent];
    if (!meta) {
      return res.json({ message: humanMsg, agentResponse: null });
    }

    // Build context from last 5 messages
    const recentMsgs = chatDB.prepare(
      'SELECT sender_name, content FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT 5'
    ).all(channelId);
    recentMsgs.reverse();

    const contextStr = recentMsgs
      .map(m => `${m.sender_name}: ${m.content}`)
      .join('\n');

    // Call agent
    let agentResponse = null;
    try {
      const thinkingLevel = await getAgentPref(targetAgent, 'thinkingLevel', 'default');
      const thinkingArgs = thinkingLevel && thinkingLevel !== 'none' && thinkingLevel !== 'default'
        ? ['--thinking', thinkingLevel]
        : [];

      const { stdout, stderr } = await execFileAsync('openclaw', [
        'agent',
        '--agent', resolveAgentId(targetAgent),
        '--message', contextStr,
        '--json',
        '--timeout', '120',
        ...thinkingArgs,
      ], { timeout: 130000, maxBuffer: 10 * 1024 * 1024 });

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = null;
      }

      let responseText = stdout.trim();
      if (parsed) {
        if (parsed.result && parsed.result.payloads && parsed.result.payloads[0]) {
          responseText = parsed.result.payloads[0].text || responseText;
        } else if (parsed.response) {
          responseText = parsed.response;
        } else if (parsed.content) {
          responseText = parsed.content;
        } else if (parsed.text) {
          responseText = parsed.text;
        }
      }

      if (responseText) {
        const agentMsgId = crypto.randomUUID();
        const agentTs = Date.now();

        chatDB.prepare(
          'INSERT INTO messages (id, channel_id, sender_id, sender_name, content, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(agentMsgId, channelId, targetAgent, meta.name, responseText, parentId || null, agentTs);

        chatDB.prepare('UPDATE channels SET last_message_at = ? WHERE id = ?').run(agentTs, channelId);

        agentResponse = {
          id: agentMsgId,
          channel_id: channelId,
          sender_id: targetAgent,
          sender_name: meta.name,
          content: responseText,
          parent_id: parentId || null,
          created_at: agentTs,
        };

        // Broadcast agent response via SSE
        broadcastChannelMessage(channelId, { type: 'message', message: agentResponse });

        // Also broadcast to thought stream
        const tsClients = thoughtStreamClients.get(targetAgent);
        if (tsClients && tsClients.size > 0) {
          const thought = JSON.stringify({
            type: 'thought',
            agentId: targetAgent,
            ts: agentTs,
            level: 'info',
            event: 'channel_response',
            message: `[#${channel.name}] ${responseText.slice(0, 200)}`,
          });
          for (const client of tsClients) {
            try { client.write(`data: ${thought}\n\n`); } catch {}
          }
        }
      }
    } catch (agentErr) {
      console.error(`[chat] Agent ${targetAgent} error:`, agentErr.message);
      // Store error as system message
      const errMsgId = crypto.randomUUID();
      const errTs = Date.now();
      const errContent = `[System] ${meta.name} is unavailable: ${agentErr.message.slice(0, 200)}`;

      chatDB.prepare(
        'INSERT INTO messages (id, channel_id, sender_id, sender_name, content, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(errMsgId, channelId, 'system', 'System', errContent, null, errTs);

      broadcastChannelMessage(channelId, {
        type: 'message',
        message: {
          id: errMsgId, channel_id: channelId, sender_id: 'system',
          sender_name: 'System', content: errContent, parent_id: null, created_at: errTs,
        }
      });

      agentResponse = {
        id: errMsgId, channel_id: channelId, sender_id: 'system',
        sender_name: 'System', content: errContent, parent_id: null, created_at: errTs,
      };
    }

    res.json({ message: humanMsg, agentResponse });
  } catch (err) {
    console.error('[chat] Message error:', err);
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
});

// GET /api/channels/:id/stream — SSE for real-time channel messages
app.get('/api/channels/:id/stream', (req, res) => {
  const { id } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('data: ' + JSON.stringify({ type: 'connected', channelId: id, ts: Date.now() }) + '\n\n');

  if (!channelStreamClients.has(id)) {
    channelStreamClients.set(id, new Set());
  }
  channelStreamClients.get(id).add(res);

  // Send keepalive every 30s
  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch { clearInterval(keepalive); }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepalive);
    const clients = channelStreamClients.get(id);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) channelStreamClients.delete(id);
    }
  });
});

// ─── CHAT — Send message to agent and get response ─────────────────────────

app.post('/api/chat', express.json(), async (req, res) => {
  const { agentId, message } = req.body;
  if (!agentId || !message) {
    return res.status(400).json({ error: 'agentId and message are required' });
  }

  const meta = AGENT_META[agentId];
  if (!meta) {
    return res.status(404).json({ error: `Unknown agent: ${agentId}` });
  }

  try {
    const { stdout, stderr } = await execFileAsync('openclaw', [
      'agent',
      '--agent', resolveAgentId(agentId),
      '--message', message,
      '--json',
      '--timeout', '120'
    ], { timeout: 130000, maxBuffer: 10 * 1024 * 1024 });

    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = null;
    }

    // Extract response text from openclaw JSON structure
    let responseText = stdout.trim();
    let model = null;
    let tokens = null;

    if (parsed) {
      // openclaw agent --json nests data at result.payloads[0].text
      if (parsed.result && parsed.result.payloads && parsed.result.payloads[0]) {
        responseText = parsed.result.payloads[0].text || responseText;
      } else if (parsed.response) {
        responseText = parsed.response;
      } else if (parsed.content) {
        responseText = parsed.content;
      } else if (parsed.text) {
        responseText = parsed.text;
      }

      // Extract model from result.meta.agentMeta.model
      if (parsed.result && parsed.result.meta && parsed.result.meta.agentMeta) {
        model = parsed.result.meta.agentMeta.model || null;
        const usage = parsed.result.meta.agentMeta.usage;
        if (usage) {
          tokens = {
            input_tokens: usage.input || usage.input_tokens || 0,
            output_tokens: usage.output || usage.output_tokens || 0,
            total_tokens: usage.total || usage.total_tokens || 0,
          };
        }
      } else {
        model = parsed.model || null;
        tokens = parsed.usage || null;
      }
    }

    // Broadcast to thought stream clients watching this agent
    const tsClients = thoughtStreamClients.get(agentId);
    if (tsClients && tsClients.size > 0) {
      const userThought = { type: 'thought', agentId, ts: Date.now(), level: 'info', event: 'chat-input', message: `[Chat] User: ${message.slice(0, 300)}`, model: null, toolName: null, toolInput: null, tokens: null, sessionId: null };
      const agentThought = { type: 'thought', agentId, ts: Date.now(), level: 'info', event: 'chat-response', message: `[Chat] ${meta.name}: ${responseText.slice(0, 400)}`, model, toolName: null, toolInput: null, tokens, sessionId: null };
      const p1 = 'data: ' + JSON.stringify(userThought) + '\n\n';
      const p2 = 'data: ' + JSON.stringify(agentThought) + '\n\n';
      for (const client of tsClients) { try { client.write(p1); client.write(p2); } catch {} }
    }
    res.json({
      agentId,
      agentName: meta.name,
      agentEmoji: meta.emoji,
      response: responseText,
      model,
      tokens,
      ts: Date.now(),
    });
  } catch (err) {
    console.error(`Chat error (${agentId}):`, err.message);
    if (err.stdout) {
      try {
        const partial = JSON.parse(err.stdout);
        let errText = err.stdout.trim();
        let errModel = null;
        let errTokens = null;
        if (partial.result && partial.result.payloads && partial.result.payloads[0]) {
          errText = partial.result.payloads[0].text || errText;
        } else {
          errText = partial.response || partial.content || errText;
        }
        if (partial.result && partial.result.meta && partial.result.meta.agentMeta) {
          errModel = partial.result.meta.agentMeta.model || null;
          const u = partial.result.meta.agentMeta.usage;
          if (u) errTokens = { input_tokens: u.input || 0, output_tokens: u.output || 0, total_tokens: u.total || 0 };
        }
        return res.json({
          agentId,
          agentName: meta.name,
          agentEmoji: meta.emoji,
          response: errText,
          model: errModel,
          tokens: errTokens,
          ts: Date.now(),
          warning: 'Response may be incomplete (timeout)',
        });
      } catch {}
    }
    res.status(500).json({
      error: 'Chat failed',
      details: err.message,
    });
  }
});

// ─── THOUGHT STREAM — SSE streaming agent activity from gateway logs ─────────

const thoughtStreamClients = new Map();

app.get('/api/agents/:id/stream', (req, res) => {
  const { id } = req.params;
  if (!AGENT_META[id]) return res.status(404).json({ error: 'Unknown agent' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('data: ' + JSON.stringify({ type: 'connected', agentId: id, ts: Date.now() }) + '\n\n');

  if (!thoughtStreamClients.has(id)) {
    thoughtStreamClients.set(id, new Set());
  }
  thoughtStreamClients.get(id).add(res);

  // Replay recent Slack/Discord channel messages for this new client
  try {
    const recent = getRecentChannelMessages(5);
    for (const msg of recent) {
      broadcastChannelThought(msg.agentId, msg.channel, msg.role, msg.text, msg.ts, res);
    }
  } catch {}

  ensureLogTail(id);

  req.on('close', () => {
    const clients = thoughtStreamClients.get(id);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        thoughtStreamClients.delete(id);
        stopLogTail(id);
      }
    }
  });
});

const logTailProcesses = new Map();

function ensureLogTail(agentId) {
  if (logTailProcesses.has(agentId)) return;

  
  const proc = spawn('openclaw', ['logs', '--follow', '--json', '--interval', '2000'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let buffer = '';

  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);

        // Skip meta entries (log cursor info, session lists)
        const entryType = entry.type || entry.event || '';
        if (entryType === 'meta' || entryType === 'cursor') continue;

        // Filter by agent — skip entries for other agents
        const entryAgent = entry.agentId || entry.agent || entry.sessionAgent || '';
        if (entryAgent && entryAgent !== agentId) continue;

        // Build the raw message string
        let msg = entry.message || entry.msg || entry.text || '';
        if (typeof msg !== 'string') msg = JSON.stringify(msg);

        // Skip noisy gateway internal dumps:
        // - Session list periodic dumps (contain sessions.json path)
        // - Full run result echoes (contain runId + payloads)
        // - Log tail notices
        const msgTrim = msg.slice(0, 200);
        if (msgTrim.includes('sessions.json') || msgTrim.includes('sessions/sessions')) continue;
        if (msgTrim.includes('"runId"') && msgTrim.includes('"payloads"')) continue;
        if (msgTrim.includes('"runId"') && msgTrim.includes('"result"')) continue;
        if (msg.includes('Log tail truncated')) continue;

        // Skip empty messages
        if (!msg.trim()) continue;

        // Truncate long messages
        if (msg.length > 500) msg = msg.slice(0, 500) + '...';

        const thought = {
          type: 'thought',
          agentId,
          ts: entry.ts || entry.timestamp || Date.now(),
          level: entry.level || 'info',
          event: entry.event || entryType || 'log',
          message: msg,
          model: entry.model || null,
          toolName: entry.toolName || entry.tool || null,
          toolInput: entry.toolInput ? (typeof entry.toolInput === 'string' ? entry.toolInput : JSON.stringify(entry.toolInput)).slice(0, 300) : null,
          tokens: entry.tokens || entry.usage || null,
          sessionId: entry.sessionId || entry.session || null,
        };

        const clients = thoughtStreamClients.get(agentId);
        if (clients) {
          const payload = 'data: ' + JSON.stringify(thought) + '\n\n';
          for (const client of clients) {
            try { client.write(payload); } catch {}
          }
        }
      } catch {}
    }
  });

  proc.stderr.on('data', (chunk) => {
    console.warn('Log tail stderr (' + agentId + '):', chunk.toString().trim());
  });

  proc.on('close', (code) => {
    logTailProcesses.delete(agentId);
    if (thoughtStreamClients.has(agentId) && thoughtStreamClients.get(agentId).size > 0) {
      setTimeout(() => ensureLogTail(agentId), 3000);
    }
  });

  logTailProcesses.set(agentId, proc);
}

function stopLogTail(agentId) {
  const proc = logTailProcesses.get(agentId);
  if (proc) {
    try { proc.kill('SIGTERM'); } catch {}
    logTailProcesses.delete(agentId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// START SERVER
// ─── CHANNEL MESSAGE WATCHER — polls Slack/Discord session files ─────────────

const OPENCLAW_AGENTS_DIR = '/home/brandon/.openclaw/agents';
const KNOWN_AGENT_IDS = ['main', 'elon', 'gary', 'warren', 'steve', 'noah', 'clay', 'calvin'];
const channelSessionPositions = new Map(); // sessionFile → lastByteOffset
let channelWatcherTimer = null;

function broadcastChannelThought(agentId, channel, role, text, timestamp, targetRes = null) {
  const agentNames = {
    main: 'Tim', elon: 'Elon', gary: 'Gary', warren: 'Warren',
    steve: 'Steve', noah: 'Noah', clay: 'Clay', calvin: 'Calvin',
  };
  const channelIcon = channel === 'slack' ? '💬 Slack' : channel === 'discord' ? '🎮 Discord' : channel;
  const who = role === 'user' ? '→ Agent' : `${agentNames[agentId] || agentId} →`;
  const preview = text.length > 400 ? text.slice(0, 400) + '…' : text;
  const thought = {
    type: 'thought',
    agentId,
    ts: timestamp || Date.now(),
    level: 'info',
    event: 'channel-message',
    message: `[${channelIcon}] ${who} ${preview}`,
    channel,
    role,
  };
  const payload = 'data: ' + JSON.stringify(thought) + '\n\n';
  if (targetRes) {
    // Send only to a specific client (for replay on connect)
    try { targetRes.write(payload); } catch {}
    return;
  }
  // Broadcast to ALL active thought stream clients (channel msgs are org-wide)
  let clientCount = 0;
  for (const [, clients] of thoughtStreamClients) {
    for (const client of clients) {
      clientCount++;
      try { client.write(payload); } catch {}
    }
  }
  if (clientCount > 0) {
    console.log(`[channel] broadcast ${channel}/${agentId}/${role}: "${preview.slice(0, 60)}" → ${clientCount} clients`);
  }
}

// Read last N messages from all channel session files (for replay on connect)
function getRecentChannelMessages(maxPerSession = 5) {
  const fs = require('fs');
  const path = require('path');
  const results = [];
  for (const agentId of KNOWN_AGENT_IDS) {
    const sessionsFile = path.join(OPENCLAW_AGENTS_DIR, agentId, 'sessions', 'sessions.json');
    let sessionsData;
    try { sessionsData = JSON.parse(fs.readFileSync(sessionsFile, 'utf8')); } catch { continue; }
    for (const [sessionKey, sessionVal] of Object.entries(sessionsData)) {
      const m = sessionKey.match(/^agent:([^:]+):(slack|discord):channel:/);
      if (!m) continue;
      const sessionId = sessionVal && sessionVal.sessionId;
      if (!sessionId) continue;
      const sessionFile = path.join(OPENCLAW_AGENTS_DIR, agentId, 'sessions', sessionId + '.jsonl');
      if (!fs.existsSync(sessionFile)) continue;
      try {
        const lines = fs.readFileSync(sessionFile, 'utf8').split('\n').filter(l => l.trim());
        const recent = lines.slice(-maxPerSession);
        for (const line of recent) {
          try {
            const entry = JSON.parse(line);
            if (entry.type !== 'message') continue;
            const msg = entry.message;
            if (!msg || !msg.role) continue;
            let text = '';
            if (typeof msg.content === 'string') { text = msg.content; }
            else if (Array.isArray(msg.content)) {
              text = msg.content.filter(c => c.type === 'text').map(c => c.text || '').join(' ');
            }
            text = text.trim();
            if (!text) continue;
            if (text.startsWith('[') && text.includes('[System Message]')) continue;
            if (text.startsWith('[') && text.includes('[sessionId:')) continue;
            results.push({
              agentId: m[1], channel: m[2], role: msg.role, text,
              ts: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
            });
          } catch {}
        }
      } catch {}
    }
  }
  // Sort by timestamp ascending
  results.sort((a, b) => a.ts - b.ts);
  return results;
}

function parseSessionKey(key) {
  // key format: agent:<agentId>:slack:channel:<channelId>
  //             agent:<agentId>:discord:channel:<channelId>
  const m = key.match(/^agent:([^:]+):(slack|discord):channel:/);
  if (!m) return null;
  return { agentId: m[1], channel: m[2] };
}

async function pollChannelSessions() {
  const fs = require('fs');
  const path = require('path');

  for (const agentId of KNOWN_AGENT_IDS) {
    const sessionsFile = path.join(OPENCLAW_AGENTS_DIR, agentId, 'sessions', 'sessions.json');
    let sessionsData;
    try {
      sessionsData = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
    } catch { continue; }

    for (const [sessionKey, sessionVal] of Object.entries(sessionsData)) {
      const parsed = parseSessionKey(sessionKey);
      if (!parsed) continue;

      const sessionId = sessionVal && sessionVal.sessionId;
      if (!sessionId) continue;

      const sessionFile = path.join(OPENCLAW_AGENTS_DIR, agentId, 'sessions', sessionId + '.jsonl');
      if (!fs.existsSync(sessionFile)) continue;

      const stat = fs.statSync(sessionFile);
      const fileSize = stat.size;
      const lastPos = channelSessionPositions.get(sessionFile);

      if (lastPos === undefined) {
        // First time seeing this file — mark position at end (don't replay history)
        channelSessionPositions.set(sessionFile, fileSize);
        continue;
      }

      if (fileSize <= lastPos) continue; // No new content

      // Read only new content
      const fd = fs.openSync(sessionFile, 'r');
      const newBytes = fileSize - lastPos;
      const buf = Buffer.alloc(newBytes);
      fs.readSync(fd, buf, 0, newBytes, lastPos);
      fs.closeSync(fd);
      channelSessionPositions.set(sessionFile, fileSize);

      const newLines = buf.toString('utf8').split('\n').filter(l => l.trim());
      for (const line of newLines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type !== 'message') continue;
          const msg = entry.message;
          if (!msg || !msg.role) continue;

          // Extract text content
          let text = '';
          if (typeof msg.content === 'string') {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            text = msg.content
              .filter(c => c.type === 'text')
              .map(c => c.text || '')
              .join(' ');
          }

          text = text.trim();
          // Skip empty, system messages (cron triggers), and tool-only messages
          if (!text) continue;
          if (text.startsWith('[') && text.includes('[System Message]')) continue;
          if (text.startsWith('[') && text.includes('[sessionId:')) continue;

          console.log(`[channel-watcher] new msg: ${parsed.agentId}/${parsed.channel}/${msg.role}`);
          broadcastChannelThought(
            parsed.agentId,
            parsed.channel,
            msg.role,
            text,
            entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now()
          );
        } catch {}
      }
    }
  }
}

function startChannelWatcher() {
  if (channelWatcherTimer) return;
  // Initial scan to register all current session file positions (no replay)
  pollChannelSessions().catch(() => {});
  // Poll every 8 seconds for new messages
  channelWatcherTimer = setInterval(() => {
    pollChannelSessions().catch(() => {});
  }, 8000);
}



// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3: GROUP MEETINGS ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

// In-memory meeting state (meetings are also persisted as channels/messages in SQLite)
const activeMeetings = new Map(); // meetingId -> MeetingState
const meetingStreamClients = new Map(); // meetingId -> Set<res>

class MeetingState {
  constructor(id, topic, participants, channelId) {
    this.id = id;
    this.topic = topic;
    this.participants = participants; // agent IDs only (no 'human')
    this.channelId = channelId;
    this.state = 'active'; // 'active' | 'paused' | 'complete'
    this.messages = []; // in-memory copy for context building
    this.currentSpeaker = null;
    this.speakerQueue = [...participants]; // agents yet to speak in current round
    this.round = 1;
    this.humanInterjection = null; // pending human message to process
    this.abortController = null; // to cancel current agent call
    this.isProcessing = false;
    this.startedAt = Date.now();
  }

  addMessage(senderId, senderName, content, role = 'assistant') {
    this.messages.push({ senderId, senderName, content, role, ts: Date.now() });
  }

  buildContext() {
    // Build conversation context string for agent prompts
    let ctx = `MEETING TOPIC: ${this.topic}\n`;
    ctx += `PARTICIPANTS: ${this.participants.map(p => {
      const m = AGENT_META[p];
      return m ? m.name + ' (' + m.role + ')' : p;
    }).join(', ')} and Brandon (CEO)\n`;
    ctx += `ROUND: ${this.round}\n\n`;
    ctx += `CONVERSATION SO FAR:\n`;

    for (const msg of this.messages.slice(-20)) {
      ctx += `${msg.senderName}: ${msg.content}\n\n`;
    }

    return ctx;
  }
}

function broadcastMeetingEvent(meetingId, event) {
  const clients = meetingStreamClients.get(meetingId);
  if (!clients || clients.size === 0) return;
  const data = JSON.stringify(event);
  for (const res of clients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
  // Also broadcast to the channel SSE
  const meeting = activeMeetings.get(meetingId);
  if (meeting && meeting.channelId) {
    broadcastChannelMessage(meeting.channelId, event);
  }
}

async function runMeetingAgent(meeting, agentId) {
  if (meeting.state !== 'active') return;

  const meta = AGENT_META[agentId];
  if (!meta) return;

  meeting.currentSpeaker = agentId;

  // Broadcast speaking indicator
  broadcastMeetingEvent(meeting.id, {
    type: 'speaking',
    agentId,
    agentName: meta.name,
    ts: Date.now(),
  });

  try {
    const context = meeting.buildContext();
    const prompt = context + `\nYou are ${meta.name} (${meta.role}). Share your perspective on this topic. Be concise (2-4 paragraphs). Respond directly to what others have said. If Brandon (the CEO) has spoken, address his points specifically.`;

    const thinkingLevel = await getAgentPref(agentId, 'thinkingLevel', 'default');
    const thinkingArgs = thinkingLevel && thinkingLevel !== 'none' && thinkingLevel !== 'default'
      ? ['--thinking', thinkingLevel]
      : [];

    const { stdout } = await execFileAsync('openclaw', [
      'agent',
      '--agent', resolveAgentId(agentId),
      '--message', prompt,
      '--json',
      '--timeout', '120',
      ...thinkingArgs,
    ], { timeout: 130000, maxBuffer: 10 * 1024 * 1024 });

    if (meeting.state !== 'active') return; // meeting may have ended during agent call

    let parsed;
    try { parsed = JSON.parse(stdout); } catch { parsed = null; }

    let responseText = stdout.trim();
    if (parsed) {
      if (parsed.result && parsed.result.payloads && parsed.result.payloads[0]) {
        responseText = parsed.result.payloads[0].text || responseText;
      } else if (parsed.response) {
        responseText = parsed.response;
      } else if (parsed.content) {
        responseText = parsed.content;
      } else if (parsed.text) {
        responseText = parsed.text;
      }
    }

    // Store in SQLite
    const msgId = crypto.randomUUID();
    const msgTs = Date.now();
    chatDB.prepare(
      'INSERT INTO messages (id, channel_id, sender_id, sender_name, content, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(msgId, meeting.channelId, agentId, meta.name, responseText, null, msgTs);
    chatDB.prepare('UPDATE channels SET last_message_at = ? WHERE id = ?').run(msgTs, meeting.channelId);

    // Add to in-memory context
    meeting.addMessage(agentId, meta.name, responseText);

    // Broadcast message
    broadcastMeetingEvent(meeting.id, {
      type: 'message',
      message: {
        id: msgId,
        channel_id: meeting.channelId,
        sender_id: agentId,
        sender_name: meta.name,
        content: responseText,
        parent_id: null,
        created_at: msgTs,
      },
    });
  } catch (err) {
    console.error(`[meeting] Agent ${agentId} error:`, err.message);
    const errId = crypto.randomUUID();
    const errTs = Date.now();
    const errContent = `[System] ${meta.name} encountered an error: ${err.message.slice(0, 200)}`;

    chatDB.prepare(
      'INSERT INTO messages (id, channel_id, sender_id, sender_name, content, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(errId, meeting.channelId, 'system', 'System', errContent, null, errTs);

    broadcastMeetingEvent(meeting.id, {
      type: 'message',
      message: {
        id: errId, channel_id: meeting.channelId, sender_id: 'system',
        sender_name: 'System', content: errContent, parent_id: null, created_at: errTs,
      },
    });
  }

  meeting.currentSpeaker = null;
}

async function runMeetingLoop(meetingId) {
  const meeting = activeMeetings.get(meetingId);
  if (!meeting || meeting.state !== 'active') return;

  meeting.isProcessing = true;

  // Initial opening message
  const openId = crypto.randomUUID();
  const openTs = Date.now();
  const openContent = `Meeting started: "${meeting.topic}"\nParticipants: ${meeting.participants.map(p => AGENT_META[p]?.name || p).join(', ')} and Brandon`;

  chatDB.prepare(
    'INSERT INTO messages (id, channel_id, sender_id, sender_name, content, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(openId, meeting.channelId, 'system', 'System', openContent, null, openTs);
  chatDB.prepare('UPDATE channels SET last_message_at = ? WHERE id = ?').run(openTs, meeting.channelId);

  meeting.addMessage('system', 'System', openContent, 'system');

  broadcastMeetingEvent(meetingId, {
    type: 'message',
    message: {
      id: openId, channel_id: meeting.channelId, sender_id: 'system',
      sender_name: 'System', content: openContent, parent_id: null, created_at: openTs,
    },
  });

  // Run agents sequentially through the queue
  while (meeting.state === 'active' && meeting.speakerQueue.length > 0) {
    // Check for human interjection before each speaker
    if (meeting.humanInterjection) {
      const humanMsg = meeting.humanInterjection;
      meeting.humanInterjection = null;
      meeting.addMessage('human', 'Brandon', humanMsg, 'user');
    }

    const nextAgent = meeting.speakerQueue.shift();
    await runMeetingAgent(meeting, nextAgent);

    // Small delay between speakers for readability
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Check for human interjection after each speaker
    if (meeting.humanInterjection) {
      const humanMsg = meeting.humanInterjection;
      meeting.humanInterjection = null;
      meeting.addMessage('human', 'Brandon', humanMsg, 'user');
    }
  }

  // Round complete — check if meeting should continue or end
  if (meeting.state === 'active') {
    if (meeting.round < 3) {
      // Start another round
      meeting.round++;
      meeting.speakerQueue = [...meeting.participants];

      broadcastMeetingEvent(meetingId, {
        type: 'round',
        round: meeting.round,
        ts: Date.now(),
      });

      // Recursive call for next round
      await runMeetingLoop(meetingId);
    } else {
      // 3 rounds done — auto-complete
      await completeMeeting(meetingId);
    }
  }

  meeting.isProcessing = false;
}

async function completeMeeting(meetingId) {
  const meeting = activeMeetings.get(meetingId);
  if (!meeting) return;

  meeting.state = 'complete';
  meeting.currentSpeaker = null;

  // Generate summary using Tim (main agent)
  let summary = 'Meeting concluded.';
  try {
    const summaryPrompt = meeting.buildContext() + `\n\nYou are Tim, the COO. Please provide a brief meeting summary with:\n1. Key decisions made\n2. Action items (who is responsible for what)\n3. Any unresolved issues\n\nKeep it concise and actionable.`;

    const { stdout } = await execFileAsync('openclaw', [
      'agent', '--agent', 'main',
      '--message', summaryPrompt,
      '--json', '--timeout', '120',
    ], { timeout: 130000, maxBuffer: 10 * 1024 * 1024 });

    let parsed;
    try { parsed = JSON.parse(stdout); } catch { parsed = null; }
    if (parsed && parsed.result && parsed.result.payloads && parsed.result.payloads[0]) {
      summary = parsed.result.payloads[0].text || summary;
    } else if (parsed && parsed.response) {
      summary = parsed.response;
    }
  } catch (err) {
    console.error('[meeting] Summary generation error:', err.message);
    summary = 'Meeting concluded. Summary generation failed.';
  }

  // Store summary
  const sumId = crypto.randomUUID();
  const sumTs = Date.now();
  const sumContent = `📋 **Meeting Summary**\n\n${summary}`;

  chatDB.prepare(
    'INSERT INTO messages (id, channel_id, sender_id, sender_name, content, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(sumId, meeting.channelId, 'system', 'Meeting Summary', sumContent, null, sumTs);
  chatDB.prepare('UPDATE channels SET last_message_at = ? WHERE id = ?').run(sumTs, meeting.channelId);

  broadcastMeetingEvent(meetingId, {
    type: 'complete',
    summary: sumContent,
    message: {
      id: sumId, channel_id: meeting.channelId, sender_id: 'system',
      sender_name: 'Meeting Summary', content: sumContent, parent_id: null, created_at: sumTs,
    },
    ts: sumTs,
  });

  // Clean up after 5 min
  setTimeout(() => {
    activeMeetings.delete(meetingId);
    meetingStreamClients.delete(meetingId);
  }, 5 * 60 * 1000);
}

// ─── Meeting API Endpoints ─────────────────────────────────────────────────

// POST /api/meetings — create and start a meeting
app.post('/api/meetings', async (req, res) => {
  try {
    const { topic, participants } = req.body;
    if (!topic || !participants || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: 'topic and participants[] are required' });
    }

    // Filter to valid agent IDs
    const validAgents = participants.filter(p => p !== 'human' && AGENT_META[p]);
    if (validAgents.length === 0) {
      return res.status(400).json({ error: 'No valid agent participants' });
    }

    const meetingId = crypto.randomUUID();
    const channelId = `meeting-${meetingId.slice(0, 8)}`;
    const now = Date.now();

    // Create channel in SQLite
    const channelName = `Meeting: ${topic.slice(0, 50)}`;
    chatDB.prepare(
      'INSERT INTO channels (id, name, type, description, participants, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(channelId, channelName, 'meeting', topic, JSON.stringify([...validAgents, 'human']), now);

    // Create in-memory meeting state
    const meeting = new MeetingState(meetingId, topic, validAgents, channelId);
    activeMeetings.set(meetingId, meeting);

    res.json({
      id: meetingId,
      channelId,
      topic,
      participants: validAgents,
      state: 'active',
      round: 1,
      startedAt: now,
    });

    // Start the meeting loop asynchronously
    setImmediate(() => runMeetingLoop(meetingId).catch(err => {
      console.error('[meeting] Loop error:', err);
    }));
  } catch (err) {
    console.error('[meeting] Create error:', err);
    res.status(500).json({ error: 'Failed to create meeting', details: err.message });
  }
});

// GET /api/meetings — list all meetings (active + recent completed)
app.get('/api/meetings', (req, res) => {
  try {
    // Get meeting channels
    const channels = chatDB.prepare(
      "SELECT * FROM channels WHERE type = 'meeting' ORDER BY created_at DESC LIMIT 50"
    ).all();

    const meetings = channels.map(ch => {
      const active = Array.from(activeMeetings.values()).find(m => m.channelId === ch.id);
      return {
        id: active ? active.id : ch.id,
        channelId: ch.id,
        topic: ch.description || ch.name,
        participants: JSON.parse(ch.participants).filter(p => p !== 'human'),
        state: active ? active.state : 'complete',
        round: active ? active.round : null,
        currentSpeaker: active ? active.currentSpeaker : null,
        startedAt: ch.created_at,
        lastMessageAt: ch.last_message_at,
      };
    });

    res.json({ meetings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list meetings', details: err.message });
  }
});

// GET /api/meetings/:id — get meeting details + messages
app.get('/api/meetings/:id', (req, res) => {
  try {
    const { id } = req.params;
    const meeting = activeMeetings.get(id);

    // Try to find by meetingId or channelId
    let channelId = meeting ? meeting.channelId : id;
    if (!meeting) {
      // Check if id is a channelId directly
      const ch = chatDB.prepare('SELECT * FROM channels WHERE id = ?').get(id);
      if (!ch) return res.status(404).json({ error: 'Meeting not found' });
      channelId = ch.id;
    }

    const channel = chatDB.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel) return res.status(404).json({ error: 'Meeting channel not found' });

    const messages = chatDB.prepare(
      'SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at ASC LIMIT 500'
    ).all(channelId);

    res.json({
      id: meeting ? meeting.id : channel.id,
      channelId,
      topic: channel.description || channel.name,
      participants: JSON.parse(channel.participants).filter(p => p !== 'human'),
      state: meeting ? meeting.state : 'complete',
      round: meeting ? meeting.round : null,
      currentSpeaker: meeting ? meeting.currentSpeaker : null,
      startedAt: channel.created_at,
      messages,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get meeting', details: err.message });
  }
});

// GET /api/meetings/:id/stream — SSE for live meeting events
app.get('/api/meetings/:id/stream', (req, res) => {
  const { id } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const meeting = activeMeetings.get(id);
  res.write('data: ' + JSON.stringify({
    type: 'connected',
    meetingId: id,
    state: meeting ? meeting.state : 'unknown',
    currentSpeaker: meeting ? meeting.currentSpeaker : null,
    round: meeting ? meeting.round : null,
    ts: Date.now(),
  }) + '\n\n');

  if (!meetingStreamClients.has(id)) {
    meetingStreamClients.set(id, new Set());
  }
  meetingStreamClients.get(id).add(res);

  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch { clearInterval(keepalive); }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepalive);
    const clients = meetingStreamClients.get(id);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) meetingStreamClients.delete(id);
    }
  });
});

// POST /api/meetings/:id/messages — human interjection during meeting
app.post('/api/meetings/:id/messages', (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }

    const meeting = activeMeetings.get(id);
    if (!meeting) {
      return res.status(404).json({ error: 'Active meeting not found' });
    }

    if (meeting.state !== 'active') {
      return res.status(400).json({ error: 'Meeting is not active' });
    }

    // Store in SQLite
    const msgId = crypto.randomUUID();
    const msgTs = Date.now();
    chatDB.prepare(
      'INSERT INTO messages (id, channel_id, sender_id, sender_name, content, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(msgId, meeting.channelId, 'human', 'Brandon', content.trim(), null, msgTs);
    chatDB.prepare('UPDATE channels SET last_message_at = ? WHERE id = ?').run(msgTs, meeting.channelId);

    // Queue human interjection for the meeting loop to pick up
    meeting.humanInterjection = content.trim();

    const humanMsg = {
      id: msgId,
      channel_id: meeting.channelId,
      sender_id: 'human',
      sender_name: 'Brandon',
      content: content.trim(),
      parent_id: null,
      created_at: msgTs,
    };

    // Broadcast immediately
    broadcastMeetingEvent(id, { type: 'message', message: humanMsg });

    res.json({ message: humanMsg });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
});

// POST /api/meetings/:id/end — force-end meeting and generate summary
app.post('/api/meetings/:id/end', async (req, res) => {
  try {
    const { id } = req.params;
    const meeting = activeMeetings.get(id);

    if (!meeting) {
      return res.status(404).json({ error: 'Active meeting not found' });
    }

    // Set state to trigger loop exit
    meeting.state = 'complete';
    meeting.speakerQueue = [];

    await completeMeeting(id);

    res.json({ success: true, state: 'complete' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to end meeting', details: err.message });
  }
});



// ═══════════════════════════════════════════════════════════════════════════════
// Phase 5: GoHighLevel CRM Integration
// ═══════════════════════════════════════════════════════════════════════════════

const GHL_CONFIG = {
  baseUrl: 'https://services.leadconnectorhq.com',
  apiToken: process.env.GHL_API_TOKEN || 'pit-49631b76-7e3e-4d60-8b01-804c386ad354',
  apiVersion: '2021-07-28',
  locationId: process.env.GHL_LOCATION_ID || 'GZecKV1IvZgcZdeVItxt',
};

class GHLService {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.headers = {
      'Authorization': `Bearer ${config.apiToken}`,
      'Version': config.apiVersion,
      'Content-Type': 'application/json',
    };
    this.locationId = config.locationId;
  }

  async _request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const opts = { method, headers: this.headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) {
      const msg = data.message || data.msg || JSON.stringify(data);
      throw new Error(`GHL ${res.status}: ${msg}`);
    }
    return data;
  }

  // ─── Contacts ──────────────────────────────────────────────────────
  async searchContacts(query = '', limit = 20) {
    let path = `/contacts/?locationId=${this.locationId}&limit=${limit}`;
    if (query) path += `&query=${encodeURIComponent(query)}`;
    return this._request('GET', path);
  }

  async getContact(id) {
    return this._request('GET', `/contacts/${id}`);
  }

  async createContact(data) {
    return this._request('POST', '/contacts/', {
      ...data,
      locationId: this.locationId,
    });
  }

  async updateContact(id, data) {
    return this._request('PUT', `/contacts/${id}`, data);
  }

  // ─── Pipelines & Opportunities ─────────────────────────────────────
  async getPipelines() {
    return this._request('GET', `/opportunities/pipelines?locationId=${this.locationId}`);
  }

  async getOpportunities(pipelineId, options = {}) {
    let path = `/opportunities/search?location_id=${this.locationId}&pipeline_id=${pipelineId}`;
    if (options.status) path += `&status=${options.status}`;
    if (options.limit) path += `&limit=${options.limit}`;
    return this._request('GET', path);
  }

  async updateOpportunity(id, data) {
    return this._request('PUT', `/opportunities/${id}`, data);
  }

  // ─── Custom Objects ────────────────────────────────────────────────
  async searchCustomObjects(schemaKey, filters = {}) {
    return this._request('POST', `/objects/${schemaKey}/records/search`, {
      locationId: this.locationId,
      ...filters,
    });
  }

  // ─── Conversations ─────────────────────────────────────────────────
  async getConversations(contactId) {
    return this._request('GET', `/conversations/search?locationId=${this.locationId}&contactId=${contactId}`);
  }

  // ─── Aggregate Stats ──────────────────────────────────────────────
  async getStats() {
    const stats = {
      contacts: { total: 0, recentCount: 0 },
      pipelines: [],
      opportunities: { total: 0, totalValue: 0, openCount: 0 },
      connected: true,
    };

    try {
      // Get contacts count
      const contactsRes = await this.searchContacts('', 1);
      stats.contacts.total = contactsRes.meta?.total || contactsRes.contacts?.length || 0;

      // Get pipelines with opportunity counts
      const pipelinesRes = await this.getPipelines();
      const pipelines = pipelinesRes.pipelines || [];

      for (const pipeline of pipelines) {
        const pipelineInfo = {
          id: pipeline.id,
          name: pipeline.name,
          stages: (pipeline.stages || []).map(s => ({ id: s.id, name: s.name })),
          opportunityCount: 0,
          totalValue: 0,
        };

        try {
          const oppsRes = await this.getOpportunities(pipeline.id, { status: 'open', limit: 100 });
          const opps = oppsRes.opportunities || [];
          pipelineInfo.opportunityCount = opps.length;
          pipelineInfo.totalValue = opps.reduce((sum, o) => sum + (o.monetaryValue || 0), 0);
          stats.opportunities.total += opps.length;
          stats.opportunities.totalValue += pipelineInfo.totalValue;
          stats.opportunities.openCount += opps.filter(o => o.status === 'open').length;
        } catch {
          // Some pipelines may not have opportunities accessible
        }

        stats.pipelines.push(pipelineInfo);
      }
    } catch (err) {
      stats.connected = false;
      stats.error = err.message;
    }

    return stats;
  }

  // ─── Connection Test ──────────────────────────────────────────────
  async testConnection() {
    try {
      const res = await this.searchContacts('', 1);
      return {
        connected: true,
        locationId: this.locationId,
        contactCount: res.meta?.total || res.contacts?.length || 0,
      };
    } catch (err) {
      return {
        connected: false,
        error: err.message,
      };
    }
  }
}

const ghlService = new GHLService(GHL_CONFIG);

// ─── GHL API Proxy Endpoints ──────────────────────────────────────────────

// Test connection
app.post('/api/ghl/test', async (req, res) => {
  try {
    const result = await ghlService.testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// Get aggregate stats
app.get('/api/ghl/stats', async (req, res) => {
  try {
    const stats = await ghlService.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch GHL stats', details: err.message });
  }
});

// Search contacts
app.get('/api/ghl/contacts', async (req, res) => {
  try {
    const { q, limit } = req.query;
    const result = await ghlService.searchContacts(q || '', parseInt(limit) || 20);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to search contacts', details: err.message });
  }
});

// Get single contact
app.get('/api/ghl/contacts/:id', async (req, res) => {
  try {
    const result = await ghlService.getContact(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get contact', details: err.message });
  }
});

// Create contact
app.post('/api/ghl/contacts', async (req, res) => {
  try {
    const result = await ghlService.createContact(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create contact', details: err.message });
  }
});

// Get pipelines
app.get('/api/ghl/pipelines', async (req, res) => {
  try {
    const result = await ghlService.getPipelines();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pipelines', details: err.message });
  }
});

// Get opportunities for a pipeline
app.get('/api/ghl/pipelines/:id/opportunities', async (req, res) => {
  try {
    const { status, limit } = req.query;
    const result = await ghlService.getOpportunities(req.params.id, {
      status: status || 'open',
      limit: parseInt(limit) || 50,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch opportunities', details: err.message });
  }
});

// Update opportunity (move stage, update status)
app.patch('/api/ghl/opportunities/:id', async (req, res) => {
  try {
    const result = await ghlService.updateOpportunity(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update opportunity', details: err.message });
  }
});

// Search custom objects
app.post('/api/ghl/custom-objects/:schemaKey/search', async (req, res) => {
  try {
    const result = await ghlService.searchCustomObjects(req.params.schemaKey, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to search custom objects', details: err.message });
  }
});

console.log('GoHighLevel CRM integration loaded (location: ' + GHL_CONFIG.locationId + ')');


// Start the watcher immediately on server startup
startChannelWatcher();

// ═══════════════════════════════════════════════════════════════════════════════

const PORT = process.env.API_PORT || 7101;
app.listen(PORT, () => {
  console.log(`NetSmithOS API server running on port ${PORT}`);
  console.log(`Loaded pricing for ${Object.keys(PRICING).length} models`);

  // Start SSE polling
  sseInterval = setInterval(ssePollCycle, 10_000);
  console.log('SSE polling started (10s interval)');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  if (sseInterval) clearInterval(sseInterval);
  for (const client of sseClients) {
    try { client.end(); } catch { /* ignore */ }
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  if (sseInterval) clearInterval(sseInterval);
  for (const client of sseClients) {
    try { client.end(); } catch { /* ignore */ }
  }
  process.exit(0);
});
