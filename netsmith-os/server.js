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
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

const WORKSPACES = {
  'main': join(HOME, 'steelclaw', 'workspace'),
  'tim': join(HOME, 'steelclaw', 'workspace'),
  'elon': join(HOME, 'steelclaw', 'workspace-elon'),
  'gary': join(HOME, 'steelclaw', 'workspace-gary'),
  'warren': join(HOME, 'steelclaw', 'workspace-warren'),
  'noah': join(HOME, 'steelclaw', 'workspace-noah'),
  'steve': join(HOME, 'steelclaw', 'workspace-steve'),
  'calvin': join(HOME, 'steelclaw', 'workspace-calvin'),
};


// ─── Agent display metadata ─────────────────────────────────────────────────────
const AGENT_META = {
  main: { name: "Tim", role: "COO", emoji: "🧠" },
  tim:  { name: "Tim", role: "COO", emoji: "🧠" },
  elon: { name: "Elon", role: "CTO", emoji: "⚡" },
  gary: { name: "Gary", role: "CMO", emoji: "📢" },
  warren: { name: "Warren", role: "CRO", emoji: "💰" },
  steve: { name: "Steve", role: "CPO", emoji: "🎯" },
  noah: { name: "Noah", role: "SMM", emoji: "📱" },
  calvin: { name: "Calvin", role: "Community", emoji: "🦞" },
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
  // Strip provider prefixes
  let name = model.replace(/^(openrouter\/|anthropic\/|google\/|openai\/)/, '');
  // Map common short names to full pricing keys
  const aliases = {
    'claude-opus-4-5': 'claude-opus-4-5-20250120',
    'claude-opus-4': 'claude-opus-4-20250514',
    'claude-sonnet-4': 'claude-sonnet-4-20250514',
    'claude-sonnet-4-6': 'claude-sonnet-4-6-20250514',
    'claude-haiku-3': 'claude-haiku-3-20250307',
    'gemini-2.5-flash': 'gemini-2.5-flash',
    'gemini-flash-2.0': 'gemini-2.5-flash',
    'gemini-2.5-pro': 'gemini-2.5-pro',
    'gpt-4o': 'gpt-4o',
    'gpt-4o-mini': 'gpt-4o-mini',
  };
  return aliases[name] || name;
}

// ─── Cost calculation helpers ───────────────────────────────────────────────────
function calculateRunCost(run) {
  const modelKey = normalizeModelName(run.model);
  const rates = PRICING[modelKey];
  if (!rates || !run.usage) return 0;
  const inputCost = (run.usage.input_tokens || 0) / 1_000_000 * rates.input;
  const outputCost = (run.usage.output_tokens || 0) / 1_000_000 * rates.output;
  return inputCost + outputCost;
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
app.post('/api/standups', async (req, res) => {
  const { topic } = req.body;
  const today = new Date().toISOString().split('T')[0];
  const filename = `${today}-standup.md`;
  const filePath = join(STANDUPS_DIR, filename);

  const content = `# Executive Standup - ${formatDate(today)}

## Topic
${topic}

## Attendees
- **Brandon** (CEO) 👤
- **Tim** (COO) 🧠
- **Calvin** (Community Agent) 🦞

---

*Standup initiated. Awaiting agent responses...*

---

## Notes

`;

  try {
    await mkdir(STANDUPS_DIR, { recursive: true });
    await writeFile(filePath, content, 'utf-8');
    res.json({ success: true, filename, content });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create standup', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NEW WAR ROOM ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

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
        .map(k => ({ agentId: k, enabled: true, every: null }));
    }
    const agents = heartbeatAgents.map(ha => {
      const agentId = ha.agentId;
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
      if (ha.enabled) {
        status = 'active';
      }
      if (latestSession) {
        const ageMinutes = (latestSession.ageMs || Infinity) / (1000 * 60);
        if (ageMinutes < 5) status = 'busy';
      }

      const meta = AGENT_META[agentId] || { name: agentId, role: 'Agent', emoji: '🤖' };
      const agentSessions = sessionsData?.sessions?.filter(s => s.agentId === agentId) || [];

      return {
        id: agentId,
        agentId,
        name: meta.name,
        role: meta.role,
        emoji: meta.emoji,
        enabled: ha.enabled,
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
  
  try {
    // Use the sessions command to check if the agent has active runs, then cancel
    const output = execSync(`openclaw sessions --agent ${id} --json`, { encoding: 'utf8', timeout: 10000 });
    // The stop is best-effort - we try to interrupt via the gateway
    try {
      execSync(`openclaw gateway rpc runs.stop --agent ${id}`, { encoding: 'utf8', timeout: 10000 });
    } catch {
      // Fallback: some versions may not support this exact command
    }
    cliCache.clear();
    res.json({ success: true, agentId: id, message: 'Stop signal sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop agent', details: err.message });
  }
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
// START SERVER
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
