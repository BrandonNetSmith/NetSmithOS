import type { Agent, CostSummary, AgentCost, Session, CronJob, Alert, ModelInfo, AgentConfig, CronCreateInput } from "./types";

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
};

// ─── Chat API ───────────────────────────────────────────────────────────────

export async function sendChat(agentId: string, message: string): Promise<import("./types").ChatResponse> {
  const r = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, message }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.details || data.error || `Chat failed: ${r.status}`);
  return data;
}
