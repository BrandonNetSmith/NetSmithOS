export interface Agent {
  id: string;
  agentId: string;
  name: string;
  role: string;
  emoji: string;
  enabled: boolean;
  model: string | null;
  workspace: string | null;
  status: "active" | "idle" | "busy" | "error";
  lastActivity: number | null;
  totalTokens: number;
  sessionCount: number;
}

export interface CostSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  burnRate: number;
  byAgent: Record<string, number>;
  byModel: Record<string, number>;
}

export interface AgentCost {
  agentId: string;
  totalCost: number;
  todayCost: number;
  monthCost: number;
  runCount: number;
  lastRun: number | null;
  byModel: Record<string, number>;
}

export interface Session {
  key: string;
  agentId: string;
  model: string;
  modelProvider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextTokens: number;
  updatedAt: number;
  kind: string;
}

export interface CronJob {
  id: string;
  agentId: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule: string | { kind: string; expr: string; tz: string };
  delivery: any;
  state: any;
  lastRun: {
    ts: number;
    status: string;
    model: string;
    usage: { input_tokens: number; output_tokens: number; total_tokens: number };
    durationMs: number;
  } | null;
  lastError?: string | null;
  consecutiveErrors?: number;
}

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
  ts: number;
  jobId?: string;
}

export type AppMode = "bridge" | "drill" | "forge" | "health" | "activity" | "org" | "tasks" | "standup" | "workspaces" | "docs" | "costs" | "settings" | "boardroom";

export interface ModelInfo {
  key: string;
  name: string;
  provider: string;
  contextWindow: number | null;
  reasoning: boolean;
}

export interface AgentConfig {
  id: string;
  model: string | null;
  thinkingLevel: string;
  heartbeat: any;
  workspace: string | null;
  identity: any;
}

export interface CronCreateInput {
  agentId: string;
  name: string;
  message: string;
  schedule?: {
    cron?: string;
    every?: string;
    at?: string;
    tz?: string;
  };
  announce?: boolean;
  channel?: string;
  session?: string;
  thinking?: string;
  model?: string;
}

// ─── Chat types ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  agentId: string;
  agentName?: string;
  agentEmoji?: string;
  content: string;
  model?: string | null;
  tokens?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null;
  ts: number;
  warning?: string;
  loading?: boolean;
}

export interface ChatResponse {
  agentId: string;
  agentName: string;
  agentEmoji: string;
  response: string;
  model: string | null;
  tokens: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null;
  ts: number;
  warning?: string;
}

// ─── Thought stream types ───────────────────────────────────────────────────

export interface ThoughtEvent {
  type: "thought" | "connected";
  agentId: string;
  ts: number;
  level?: string;
  event?: string;
  message?: string;
  model?: string | null;
  toolName?: string | null;
  toolInput?: string | null;
  tokens?: any | null;
  sessionId?: string | null;
}


// ─── Phase 2: Channel types ────────────────────────────────────────────────

export interface Channel {
  id: string;
  name: string;
  type: 'group' | 'direct' | 'meeting' | 'boardroom';
  description: string | null;
  participants: string[];
  created_at: number;
  last_message_at: number | null;
  lastMessage?: {
    content: string;
    sender_name: string;
    created_at: number;
  } | null;
}

export interface ChannelMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  parent_id: string | null;
  created_at: number;
}

// ─── Phase 3: Meeting types ────────────────────────────────────────────────

export interface Meeting {
  id: string;
  channelId: string;
  topic: string;
  participants: string[];
  state: 'active' | 'paused' | 'complete';
  round: number | null;
  currentSpeaker: string | null;
  startedAt: number;
  lastMessageAt?: number | null;
  messages?: ChannelMessage[];
}

export interface MeetingEvent {
  type: 'connected' | 'message' | 'speaking' | 'round' | 'complete';
  meetingId?: string;
  agentId?: string;
  agentName?: string;
  message?: ChannelMessage;
  summary?: string;
  round?: number;
  state?: string;
  currentSpeaker?: string | null;
  ts: number;
}



// ─── Phase 5: GoHighLevel CRM types ────────────────────────────────────────

export interface GHLConnectionTest {
  connected: boolean;
  locationId?: string;
  contactCount?: number;
  error?: string;
}

export interface GHLPipelineStage {
  id: string;
  name: string;
}

export interface GHLPipeline {
  id: string;
  name: string;
  stages: GHLPipelineStage[];
  opportunityCount: number;
  totalValue: number;
}

export interface GHLStats {
  contacts: {
    total: number;
    recentCount: number;
  };
  pipelines: GHLPipeline[];
  opportunities: {
    total: number;
    totalValue: number;
    openCount: number;
  };
  connected: boolean;
  error?: string;
}

export interface GHLContact {
  id: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  dateAdded?: string;
  source?: string;
}

export interface GHLOpportunity {
  id: string;
  name: string;
  monetaryValue: number;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  contact?: GHLContact;
  createdAt?: string;
  updatedAt?: string;
}
