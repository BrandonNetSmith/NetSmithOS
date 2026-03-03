import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface AgentModel {
  agentId: string
  agentName: string
  model: string
  modelDisplay: string
  provider: string
  status: string
  thinkingLevel: string
  sessionCount: number
  totalTokens: number
}

interface SessionInfo {
  agent: string
  model: string
  lastActivity: string
  tokens: number
  status: string
  ageMs: number
}

const MODEL_COSTS: Record<string, string> = {
  'opus': '$15/1M in · $75/1M out',
  'sonnet-4': '$3/1M in · $15/1M out',
  'sonnet': '$3/1M in · $15/1M out',
  'haiku': '$0.25/1M in · $1.25/1M out',
  'gpt-4o': '$2.50/1M in · $10/1M out',
  'gpt-4': '$10/1M in · $30/1M out',
  'gemini-2.5-flash': '$0.15/1M in · $0.60/1M out',
  'gemini-2.5-pro': '$1.25/1M in · $10/1M out',
  'gemini-2.0-flash': '$0.075/1M in · $0.30/1M out',
  'grok-4': '$3/1M in · $15/1M out',
  'grok-3': '$3/1M in · $15/1M out',
  'grok-3-mini': '$0.30/1M in · $0.50/1M out',
  'grok-2': '$2/1M in · $10/1M out',
  'deepseek': '$0.27/1M in · $1.10/1M out',
}

function getModelCost(model: string): string {
  const lower = model.toLowerCase()
  for (const [key, cost] of Object.entries(MODEL_COSTS)) {
    if (lower.includes(key)) return cost
  }
  return 'varies'
}

function getModelPurpose(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes('opus')) return 'Complex reasoning & analysis'
  if (lower.includes('sonnet')) return 'Balanced performance'
  if (lower.includes('haiku')) return 'Fast, simple tasks'
  if (lower.includes('grok-4')) return 'Advanced reasoning (xAI)'
  if (lower.includes('grok-3-mini')) return 'Fast lightweight tasks (xAI)'
  if (lower.includes('grok-3')) return 'Balanced reasoning (xAI)'
  if (lower.includes('grok-2')) return 'Legacy reasoning (xAI)'
  if (lower.includes('grok-code')) return 'Code specialist (xAI)'
  if (lower.includes('flash')) return 'Fast iteration & drafts'
  if (lower.includes('pro')) return 'Advanced reasoning'
  if (lower.includes('deepseek')) return 'Code & reasoning'
  return 'General purpose'
}

function formatAge(ms: number): string {
  if (!ms || ms < 0) return 'unknown'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return minutes + 'm ago'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + 'h ' + (minutes % 60) + 'm ago'
  const days = Math.floor(hours / 24)
  return days + 'd ' + (hours % 24) + 'h ago'
}

export default function TaskManager() {
  const [agentModels, setAgentModels] = useState<AgentModel[]>([])
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      setError(null)
      const agents = await api.getAgents()
      const configs = await Promise.allSettled(
        agents.map((a: any) => api.getAgentConfig(a.id || a.agentId))
      )

      const modelMap = new Map<string, AgentModel>()
      const allSessions: SessionInfo[] = []

      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i] as any
        const agentId = agent.id || agent.agentId
        const config = configs[i].status === 'fulfilled' ? (configs[i] as any).value : null
        const model = config?.model || agent.model || 'unknown'
        const provider = model.includes('/')
          ? (model.startsWith('openrouter/') ? model.split('/')[1] : model.split('/')[0])
          : 'unknown'
        const modelDisplay = model.startsWith('openrouter/')
          ? model.replace('openrouter/', '').split('/').pop() || model
          : model.split('/').pop() || model

        const existing = modelMap.get(model)
        if (existing) {
          existing.sessionCount += agent.sessionCount || 0
          existing.totalTokens += agent.totalTokens || 0
        } else {
          modelMap.set(model, {
            agentId,
            agentName: agent.name || agentId,
            model,
            modelDisplay,
            provider,
            status: agent.status || 'idle',
            thinkingLevel: config?.thinkingLevel || 'off',
            sessionCount: agent.sessionCount || 0,
            totalTokens: agent.totalTokens || 0,
          })
        }

        allSessions.push({
          agent: agent.name || agentId,
          model: modelDisplay,
          lastActivity: agent.lastActivity
            ? formatAge(Date.now() - new Date(agent.lastActivity).getTime())
            : 'no activity',
          tokens: agent.totalTokens || 0,
          status: agent.status || 'idle',
          ageMs: agent.lastActivity
            ? Date.now() - new Date(agent.lastActivity).getTime()
            : Infinity,
        })
      }

      setAgentModels([...modelMap.values()])
      setSessions(allSessions.sort((a, b) => a.ageMs - b.ageMs))
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Failed to load data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const activeSessions = sessions.filter(s => s.status === 'active' || s.status === 'busy').length
  const idleSessions = sessions.filter(s => s.status === 'idle').length
  const totalTokens = sessions.reduce((acc, s) => acc + s.tokens, 0)
  const uniqueModels = new Set(agentModels.map(m => m.model)).size

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading task manager...</div>
  }

  return (
    <>
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: '16px',
          color: '#ef4444',
          fontSize: '13px'
        }}>
          {error}
        </div>
      )}

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value accent">{activeSessions}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Idle</div>
          <div className="stat-value">{idleSessions}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Agents</div>
          <div className="stat-value">{sessions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Models in Use</div>
          <div className="stat-value accent">{uniqueModels}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tokens Used</div>
          <div className="stat-value">{totalTokens > 0 ? (totalTokens / 1000).toFixed(0) + 'K' : '0'}</div>
        </div>
      </div>

      <div className="section-title">Model Fleet</div>
      <div className="card-grid">
        {agentModels.map((m, i) => (
          <div className="model-card" key={i}>
            <div className="card-header">
              <div>
                <div className="card-title">{m.modelDisplay}</div>
                <div className="card-subtitle">{getModelPurpose(m.model)}</div>
              </div>
              <span className={'status-badge ' + (m.status === 'active' || m.status === 'busy' ? 'active' : 'inactive')}>
                {m.status}
              </span>
            </div>
            <div className="card-stats">
              <div className="card-stat">
                <span className="card-stat-label">Full key:</span>
                <span className="card-stat-value" style={{ fontSize: '10px', opacity: 0.7 }}>{m.model}</span>
              </div>
            </div>
            <div className="card-stats">
              <div className="card-stat">
                <span className="card-stat-label">Provider:</span>
                <span className="card-stat-value">{m.provider}</span>
              </div>
              <div className="card-stat">
                <span className="card-stat-label">Cost:</span>
                <span className="card-stat-value">{getModelCost(m.model)}</span>
              </div>
            </div>
            <div className="card-stats">
              <div className="card-stat">
                <span className="card-stat-label">Thinking:</span>
                <span className="card-stat-value" style={{ color: m.thinkingLevel !== 'off' ? 'var(--accent-primary)' : undefined }}>
                  {m.thinkingLevel}
                </span>
              </div>
              <div className="card-stat">
                <span className="card-stat-label">Sessions:</span>
                <span className="card-stat-value">{m.sessionCount}</span>
              </div>
            </div>
          </div>
        ))}
        {agentModels.length === 0 && (
          <div style={{ color: 'var(--text-muted)', padding: '24px' }}>No agents configured</div>
        )}
      </div>

      <div className="section-title">Agent Sessions</div>
      <div className="card-grid">
        {sessions.map((session, i) => (
          <div className="session-card" key={i}>
            <div className="card-header">
              <div>
                <div className="card-title">{session.agent}</div>
                <div className="card-subtitle">{session.model}</div>
              </div>
              <span className={'status-badge ' + (session.status === 'active' || session.status === 'busy' ? 'active' : 'inactive')}>
                {session.status}
              </span>
            </div>
            <div className="card-stats">
              <div className="card-stat">
                <span className="card-stat-label">Last activity:</span>
                <span className="card-stat-value">{session.lastActivity}</span>
              </div>
              <div className="card-stat">
                <span className="card-stat-label">Tokens:</span>
                <span className="card-stat-value">{session.tokens > 0 ? (session.tokens / 1000).toFixed(1) + 'K' : '0'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '24px' }}>
        Last refreshed: {lastRefresh.toLocaleTimeString()} &middot; Auto-refresh every 30s
      </div>
    </>
  )
}
