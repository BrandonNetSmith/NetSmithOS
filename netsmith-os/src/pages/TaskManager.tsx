import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { CronJob, AppMode } from '../api/types'

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

type ModelType = 'LLM' | 'Image' | 'Video' | 'Audio' | 'Music'

interface FleetEntry {
  name: string
  shortName: string
  purpose: string
  provider: string
  authMethod: string
  status: 'Active' | 'Available' | 'Locked'
  agents: string[]
  agentCount: number
  cost: string
  type: ModelType
}

const TYPE_ORDER: ModelType[] = ['LLM', 'Image', 'Video', 'Audio', 'Music']
const TYPE_ICONS: Record<ModelType, string> = {
  LLM: '\u{1F9E0}', Image: '\u{1F3A8}', Video: '\u{1F3AC}', Audio: '\u{1F399}\uFE0F', Music: '\u{1F3B5}'
}
const TYPE_LABELS: Record<ModelType, string> = {
  LLM: 'Language Models', Image: 'Image Generation', Video: 'Video Generation', Audio: 'Audio & Voice', Music: 'Music Generation'
}

const MODEL_COSTS: Record<string, string> = {
  'opus': '$15/1M in \u00B7 $75/1M out',
  'sonnet-4': '$3/1M in \u00B7 $15/1M out',
  'sonnet': '$3/1M in \u00B7 $15/1M out',
  'haiku': '$0.25/1M in \u00B7 $1.25/1M out',
  'gpt-4o': '$2.50/1M in \u00B7 $10/1M out',
  'gpt-4': '$10/1M in \u00B7 $30/1M out',
  'gemini-2.5-flash': '$0.15/1M in \u00B7 $0.60/1M out',
  'gemini-2.5-pro': '$1.25/1M in \u00B7 $10/1M out',
  'gemini-2.0-flash': '$0.075/1M in \u00B7 $0.30/1M out',
  'grok-4': '$3/1M in \u00B7 $15/1M out',
  'grok-3': '$3/1M in \u00B7 $15/1M out',
  'grok-3-mini': '$0.30/1M in \u00B7 $0.50/1M out',
  'grok-2': '$2/1M in \u00B7 $10/1M out',
  'deepseek': '$0.27/1M in \u00B7 $1.10/1M out',
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

function formatTs(ts: number): string {
  if (!ts) return 'never'
  return formatAge(Date.now() - ts)
}

function getScheduleDisplay(schedule: string | { kind: string; expr: string; tz?: string }): string {
  if (typeof schedule === 'string') return schedule
  return schedule.expr || schedule.kind
}

export default function TaskManager({ onNavigate }: { onNavigate?: (mode: AppMode) => void }) {
  const [agentModels, setAgentModels] = useState<AgentModel[]>([])
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [fleet, setFleet] = useState<FleetEntry[]>([])
  const [cronJobs, setCronJobs] = useState<CronJob[]>([])
  const [monthlyCost, setMonthlyCost] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [expandedCrons, setExpandedCrons] = useState<Set<string>>(new Set())

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

      // Load AI fleet
      try {
        const fleetRes = await fetch('/api/fleet')
        if (fleetRes.ok) {
          const fleetData = await fleetRes.json()
          setFleet(fleetData.fleet || [])
        }
      } catch {
        // fleet is optional
      }

      // Load cron jobs
      try {
        const jobs = await api.getCronJobs()
        setCronJobs(Array.isArray(jobs) ? jobs : [])
      } catch {
        // cron is optional
      }

      // Load monthly cost
      try {
        const costs = await api.getCostSummary()
        setMonthlyCost(costs.thisMonth ?? null)
      } catch {
        // costs is optional
      }

      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const activeSessions = sessions.filter(s => s.status === 'active' || s.status === 'busy').length
  const idleSessions = sessions.filter(s => s.status === 'idle').length
  const totalTokens = sessions.reduce((acc, s) => acc + s.tokens, 0)
  const activeFleetCount = fleet.filter(m => m.status === 'Active').length
  const totalFleetCount = fleet.length

  const fleetByType: Record<ModelType, FleetEntry[]> = { LLM: [], Image: [], Video: [], Audio: [], Music: [] }
  for (const entry of fleet) {
    const t = entry.type as ModelType
    if (fleetByType[t]) fleetByType[t].push(entry)
  }

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
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => document.getElementById('sessions-section')?.scrollIntoView({ behavior: 'smooth' })} title="Scroll to Agent Sessions">
          <div className="stat-label">Active</div>
          <div className="stat-value accent">{activeSessions}</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => document.getElementById('sessions-section')?.scrollIntoView({ behavior: 'smooth' })} title="Scroll to Agent Sessions">
          <div className="stat-label">Idle</div>
          <div className="stat-value">{idleSessions}</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => document.getElementById('sessions-section')?.scrollIntoView({ behavior: 'smooth' })} title="Scroll to Agent Sessions">
          <div className="stat-label">Total Agents</div>
          <div className="stat-value">{sessions.length}</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => document.getElementById('fleet-section')?.scrollIntoView({ behavior: 'smooth' })} title="Scroll to AI Fleet">
          <div className="stat-label">AI Capabilities</div>
          <div className="stat-value accent">{activeFleetCount > 0 ? activeFleetCount + ' active / ' + totalFleetCount : totalFleetCount}</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate?.('costs')} title="View Cost Explorer">
          <div className="stat-label">Tokens Used</div>
          <div className="stat-value">{totalTokens > 0 ? (totalTokens / 1000).toFixed(0) + 'K' : '0'}</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate?.('costs')} title="View Cost Explorer">
          <div className="stat-label">Total Cost</div>
          <div className="stat-value accent">
            {monthlyCost !== null ? '$' + monthlyCost.toFixed(2) : '—'}
          </div>
        </div>
      </div>

      <div className="section-title" id="fleet-section">AI Fleet</div>
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

      {fleet.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <div className="section-title">AI Fleet</div>
          {TYPE_ORDER.map(type => {
            const entries = fleetByType[type]
            if (!entries || entries.length === 0) return null
            return (
              <div key={type} style={{ marginBottom: '24px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em'
                }}>
                  <span style={{ fontSize: '16px' }}>{TYPE_ICONS[type]}</span>
                  {TYPE_LABELS[type]}
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 400,
                    color: 'var(--text-muted)',
                    textTransform: 'none',
                    letterSpacing: 'normal'
                  }}>
                    ({entries.length} {entries.length === 1 ? 'model' : 'models'})
                  </span>
                </div>
                <div className="card-grid">
                  {entries.map((entry, i) => (
                    <div
                      className="model-card"
                      key={i}
                      style={{
                        opacity: entry.status === 'Locked' ? 0.6 : 1,
                        borderColor: entry.status === 'Active'
                          ? 'rgba(20, 184, 166, 0.4)'
                          : entry.status === 'Locked'
                          ? 'rgba(100, 116, 139, 0.3)'
                          : undefined,
                      }}
                    >
                      <div className="card-header">
                        <div>
                          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '14px' }}>{TYPE_ICONS[type]}</span>
                            {entry.shortName}
                          </div>
                          <div className="card-subtitle">{entry.purpose}</div>
                        </div>
                        <span
                          className={entry.status === 'Active' ? 'status-badge active' : 'status-badge inactive'}
                          style={entry.status === 'Locked' ? {
                            background: 'rgba(100, 116, 139, 0.2)',
                            color: 'var(--text-muted)',
                            borderColor: 'rgba(100, 116, 139, 0.3)',
                          } : undefined}
                        >
                          {entry.status === 'Locked' ? '\uD83D\uDD12 Locked' : entry.status}
                        </span>
                      </div>
                      <div className="card-stats">
                        <div className="card-stat">
                          <span className="card-stat-label">Auth:</span>
                          <span className="card-stat-value" style={{ fontSize: '11px' }}>{entry.authMethod}</span>
                        </div>
                        <div className="card-stat">
                          <span className="card-stat-label">Cost:</span>
                          <span className="card-stat-value">{entry.cost}</span>
                        </div>
                      </div>
                      {entry.agents && entry.agents.length > 0 && (
                        <div className="card-stats">
                          <div className="card-stat">
                            <span className="card-stat-label">Agents:</span>
                            <span className="card-stat-value">{entry.agents.join(', ')}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="section-title" style={{ marginTop: fleet.length > 0 ? '32px' : undefined }} id="sessions-section">Agent Sessions</div>
      <div className="card-grid">
        {sessions.map((session, i) => {
          const sessionKey = `${session.agent}-${i}`
          const isExpanded = expandedSessions.has(sessionKey)
          return (
          <div className="session-card" key={i} style={{ cursor: 'pointer' }} onClick={() => setExpandedSessions(prev => { const n = new Set(prev); if (n.has(sessionKey)) n.delete(sessionKey); else n.add(sessionKey); return n; })}>
            <div className="card-header">
              <div>
                <div className="card-title">{session.agent}</div>
                <div className="card-subtitle">{session.model}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={'status-badge ' + (session.status === 'active' || session.status === 'busy' ? 'active' : 'inactive')}>
                  {session.status}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>
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
            {isExpanded && (
              <div className="card-stats" style={{ borderTop: '1px solid var(--bg-hover)', paddingTop: 8, marginTop: 4, flexDirection: 'column', gap: 4 }}>
                <div className="card-stat">
                  <span className="card-stat-label">Agent:</span>
                  <span className="card-stat-value" style={{ fontFamily: 'monospace' }}>{session.agent}</span>
                </div>
                <div className="card-stat">
                  <span className="card-stat-label">Model:</span>
                  <span className="card-stat-value" style={{ fontFamily: 'monospace' }}>{session.model}</span>
                </div>
                <div className="card-stat">
                  <span className="card-stat-label">Status:</span>
                  <span className="card-stat-value">{session.status}</span>
                </div>
              </div>
            )}
          </div>
          )
        })}
      </div>

      {cronJobs.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <div className="section-title" id="cron-section">Cron Jobs</div>
          <div className="card-grid">
            {cronJobs.map((job) => {
              const scheduleStr = getScheduleDisplay(job.schedule)
              const lastRunStatus = job.lastRun?.status
              const lastRunTs = job.lastRun?.ts
              const hasErrors = (job.consecutiveErrors ?? 0) > 0

              const isCronExpanded = expandedCrons.has(job.id)
              return (
                <div
                  className="model-card"
                  key={job.id}
                  style={{
                    borderColor: hasErrors
                      ? 'rgba(239, 68, 68, 0.4)'
                      : lastRunStatus === 'ok'
                      ? 'rgba(20, 184, 166, 0.3)'
                      : undefined,
                    opacity: job.enabled ? 1 : 0.6,
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpandedCrons(prev => { const n = new Set(prev); if (n.has(job.id)) n.delete(job.id); else n.add(job.id); return n; })}
                >
                  <div className="card-header">
                    <div>
                      <div className="card-title">{job.name || job.id}</div>
                      <div className="card-subtitle" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                        {scheduleStr}
                      </div>
                    </div>
                    <span
                      className={'status-badge ' + (lastRunStatus === 'ok' ? 'active' : lastRunStatus === 'error' ? 'error' : 'inactive')}
                      style={lastRunStatus === 'error' ? {
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#ef4444',
                        borderColor: 'rgba(239, 68, 68, 0.3)',
                      } : undefined}
                    >
                      {lastRunStatus || 'pending'}
                    </span>
                  </div>
                  <div className="card-stats">
                    <div className="card-stat">
                      <span className="card-stat-label">Agent:</span>
                      <span className="card-stat-value" style={{
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        borderRadius: '4px',
                        padding: '1px 6px',
                        fontSize: '11px',
                        color: 'var(--accent-primary)',
                      }}>
                        {job.agentId}
                      </span>
                    </div>
                    <div className="card-stat">
                      <span className="card-stat-label">Last run:</span>
                      <span className="card-stat-value">{lastRunTs ? formatTs(lastRunTs) : 'never'}</span>
                    </div>
                  </div>
                  {hasErrors && (
                    <div className="card-stats">
                      <div className="card-stat">
                        <span className="card-stat-label" style={{ color: '#ef4444' }}>Errors:</span>
                        <span className="card-stat-value" style={{ color: '#ef4444' }}>
                          {job.consecutiveErrors} consecutive
                        </span>
                      </div>
                    </div>
                  )}
                  {isCronExpanded && (
                    <div className="card-stats" style={{ borderTop: '1px solid var(--bg-hover)', paddingTop: 8, marginTop: 4, flexDirection: 'column', gap: 4 }}>
                      {job.description && (
                        <div className="card-stat"><span className="card-stat-label">Desc:</span><span className="card-stat-value" style={{ whiteSpace: 'normal' }}>{job.description}</span></div>
                      )}
                      <div className="card-stat"><span className="card-stat-label">Enabled:</span><span className="card-stat-value">{job.enabled ? 'Yes' : 'No'}</span></div>
                      <div className="card-stat"><span className="card-stat-label">Schedule:</span><span className="card-stat-value" style={{ fontFamily: 'monospace' }}>{scheduleStr}</span></div>
                      {job.lastRun && (
                        <>
                          <div className="card-stat"><span className="card-stat-label">Duration:</span><span className="card-stat-value">{job.lastRun.durationMs ? (job.lastRun.durationMs / 1000).toFixed(1) + 's' : '—'}</span></div>
                          {job.lastRun.usage && (
                            <div className="card-stat"><span className="card-stat-label">Tokens:</span><span className="card-stat-value">{job.lastRun.usage.total_tokens?.toLocaleString() || '—'}</span></div>
                          )}
                        </>
                      )}
                      {job.lastError && (
                        <div className="card-stat"><span className="card-stat-label" style={{ color: '#ef4444' }}>Last error:</span><span className="card-stat-value" style={{ color: '#ef4444', fontSize: 11, wordBreak: 'break-word' }}>{job.lastError.slice(0, 200)}</span></div>
                      )}
                    </div>
                  )}
                  <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{isCronExpanded ? '▲ collapse' : '▼ details'}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '24px' }}>
        Last refreshed: {lastRefresh.toLocaleTimeString()} &middot; Auto-refresh every 30s
      </div>
    </>
  )
}
