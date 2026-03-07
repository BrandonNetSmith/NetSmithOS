import type { Agent, CostSummary, AgentCost, Session, CronJob, Alert, ModelInfo, AgentConfig, CronCreateInput, Channel, ChannelMessage, Meeting, GHLConnectionTest, GHLStats, GHLContact, GHLPipeline } from "./types";

const BASE = "/api";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function fetchWithError(url: string, options: RequestInit): Promise<any> {
  const r = await fetch(url, options);
  const data = await r.json();
  if (!r.ok) throw new Error(data.details || data.error || `Request failed: ${r.status}`);
  return data;
}

export const api = {
  getHealth: () => fetchJSON<{ gateway: string; uptime: number; version: string; agentCount: number }>("/health"),
  getHealthHistory: () => fetchJSON<{ cpu: number[]; memory: number[]; timestamps: number[] }>("/health/history"),
  getAgents: () => fetchJSON<Agent[]>("/agents"),
  getAgentSessions: (id: string) => fetchJSON<{ sessions: Session[] }>(`/agents/${id}/sessions`),
  getCostSummary: () => fetchJSON<CostSummary>("/costs/summary"),
  getCostsByAgent: () => fetchJSON<AgentCost[]>("/costs/by-agent"),
  getCronJobs: () => fetchJSON<CronJob[]>("/cron/jobs"),
  getAlerts: () => fetchJSON<Alert[]>("/alerts"),
  getActivity: () => fetchJSON<any[]>("/activity"),
  getWorkspaceFiles: (agent: string) => fetchJSON<{ agent: string; path: string; files: any[] }>(`/workspace/${agent}/files`),
  getWorkspaceFile: (agent: string, path: string) => fetchJSON<{ content: string; path: string }>(`/workspace/${agent}/file?path=${encodeURIComponent(path)}`),

  // Drill Mode API methods
  getAgentMemory: (id: string) => fetchJSON<{ filename: string; date: string; content: string; fullPath?: string }[]>(`/agents/${id}/memory`),
  getAgentMemoryFile: (id: string, filename: string) => fetchJSON<{ filename: string; content: string }>(`/agents/${id}/memory/${encodeURIComponent(filename)}`),
  getAgentCosts: (id: string) => fetchJSON<{ today: number; thisWeek: number; thisMonth: number; total: number; byModel: Record<string, number>; runs: any[] }>(`/agents/${id}/costs`),
  getAgentCron: (id: string) => fetchJSON<CronJob[]>(`/agents/${id}/cron`),
  getAgentWorkspace: (id: string) => fetchJSON<{ agent: string; tree: any }>(`/agents/${id}/workspace`),

  // Management API methods
  getModels: () => fetchJSON<{ count: number; models: ModelInfo[] }>("/models"),
  getAgentConfig: (id: string) => fetchJSON<AgentConfig>(`/agents/${id}/config`),
  updateAgentModel: (id: string, model: string) =>
    fetchWithError(`${BASE}/agents/${id}/model`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) }),
  updateAgentThinking: (id: string, level: string) =>
    fetchWithError(`${BASE}/agents/${id}/thinking`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ level }) }),
  stopAgent: (id: string) =>
    fetchWithError(`${BASE}/agents/${id}/stop`, { method: "POST" }),
  renameAgent: (id: string, name: string) =>
    fetchWithError(`${BASE}/agents/${id}/rename`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }),
  deleteAgent: (id: string) =>
    fetchWithError(`${BASE}/agents/${id}`, { method: "DELETE" }),
  runCronJob: (jobId: string) =>
    fetchWithError(`${BASE}/cron/jobs/${jobId}/run`, { method: "POST" }),
  deleteCronJob: (jobId: string) =>
    fetchWithError(`${BASE}/cron/jobs/${jobId}`, { method: "DELETE" }),
  createCronJob: (input: CronCreateInput) =>
    fetchWithError(`${BASE}/cron/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),

  // ── Phase 2: Channel API ─────────────────────────────────────────────
  getChannels: () => fetchJSON<{ channels: Channel[] }>("/channels"),
  createChannel: (data: { name: string; type: string; participants: string[]; description?: string }) =>
    fetchWithError(`${BASE}/channels`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  getChannelMessages: (id: string, limit = 50, before?: number) =>
    fetchJSON<{ messages: ChannelMessage[]; hasMore: boolean }>(`/channels/${id}/messages?limit=${limit}${before ? `&before=${before}` : ''}`),
  sendChannelMessage: (id: string, content: string, parentId?: string) =>
    fetchWithError(`${BASE}/channels/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, parentId }) }),

  // ── Phase 3: Meeting API ─────────────────────────────────────────────
  getMeetings: () => fetchJSON<{ meetings: Meeting[] }>("/meetings"),
  getMeeting: (id: string) => fetchJSON<Meeting>(`/meetings/${id}`),
  createMeeting: (topic: string, participants: string[]) =>
    fetchWithError(`${BASE}/meetings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, participants }) }),
  sendMeetingMessage: (id: string, content: string) =>
    fetchWithError(`${BASE}/meetings/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) }),
  endMeeting: (id: string) =>
    fetchWithError(`${BASE}/meetings/${id}/end`, { method: "POST" }),

  // ── Phase 5: GoHighLevel CRM API ──────────────────────────────────────
  ghlTest: () =>
    fetchWithError(`${BASE}/ghl/test`, { method: "POST" }) as Promise<GHLConnectionTest>,
  ghlGetStats: () => fetchJSON<GHLStats>("/ghl/stats"),
  ghlSearchContacts: (q = '', limit = 20) =>
    fetchJSON<{ contacts: GHLContact[]; meta?: { total: number } }>(`/ghl/contacts?q=${encodeURIComponent(q)}&limit=${limit}`),
  ghlGetContact: (id: string) => fetchJSON<{ contact: GHLContact }>(`/ghl/contacts/${id}`),
  ghlGetPipelines: () => fetchJSON<{ pipelines: GHLPipeline[] }>("/ghl/pipelines"),
  ghlGetOpportunities: (pipelineId: string, status = 'open') =>
    fetchJSON<{ opportunities: any[] }>(`/ghl/pipelines/${pipelineId}/opportunities?status=${status}`),
};


