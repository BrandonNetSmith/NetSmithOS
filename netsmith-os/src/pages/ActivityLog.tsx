import { useState, useEffect } from 'react'

interface ActivityRun {
  ts: number
  jobId: string
  agentId: string
  status: string
  error: string | null
  summary: string | null
  durationMs: number
  model: string | null
  provider: string | null
  usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null
}

const AGENT_META: Record<string, { name: string; emoji: string }> = {
  tim: { name: 'Tim', emoji: '🧠' },
  main: { name: 'Tim', emoji: '🧠' },
  elon: { name: 'Elon', emoji: '⚡' },
  gary: { name: 'Gary', emoji: '📢' },
  warren: { name: 'Warren', emoji: '💰' },
  steve: { name: 'Steve', emoji: '🎯' },
  noah: { name: 'Noah', emoji: '📱' },
  calvin: { name: 'Calvin', emoji: '🎭' },
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s'
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `${mins}m ${remSecs}s`
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default function ActivityLog() {
  const [runs, setRuns] = useState<ActivityRun[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadActivity()
    const interval = setInterval(loadActivity, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadActivity = async () => {
    try {
      setError(null)
      const res = await fetch('/api/activity')
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const data = await res.json()
      setRuns(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity')
    }
  }

  const toggleExpand = (idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  if (!runs.length && !error) {
    return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading activity...</div>
  }

  return (
    <>
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-md, 8px)',
          padding: '12px 16px',
          marginBottom: '16px',
          color: '#ef4444',
          fontSize: '13px'
        }}>
          ⚠️ {error}
        </div>
      )}

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Runs</div>
          <div className="stat-value">{runs.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Successful</div>
          <div className="stat-value" style={{ color: '#22c55e' }}>
            {runs.filter(r => r.status === 'ok' || r.status === 'success').length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Errors</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>
            {runs.filter(r => r.status === 'error').length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Agents Active</div>
          <div className="stat-value accent">
            {new Set(runs.map(r => r.agentId)).size}
          </div>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: '24px' }}>📜 Run Timeline</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {runs.map((run, idx) => {
          const agent = AGENT_META[run.agentId] || { name: run.agentId, emoji: '🤖' }
          const isError = run.status === 'error'
          const isExpanded = expanded.has(idx)
          const summaryText = run.summary || run.error || '—'
          const truncated = summaryText.length > 120 && !isExpanded
            ? summaryText.slice(0, 120) + '…'
            : summaryText

          return (
            <div
              className="model-card"
              key={`${run.ts}-${idx}`}
              style={{
                cursor: summaryText.length > 120 ? 'pointer' : 'default',
                borderLeft: `3px solid ${isError ? '#ef4444' : '#22c55e'}`,
              }}
              onClick={() => summaryText.length > 120 && toggleExpand(idx)}
            >
              <div className="card-header">
                <div style={{ flex: 1 }}>
                  <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{agent.emoji}</span>
                    <span>{agent.name}</span>
                    <span
                      className={`status-badge ${isError ? 'inactive' : 'active'}`}
                      style={{ fontSize: '11px', padding: '2px 8px' }}
                    >
                      {isError ? 'error' : 'success'}
                    </span>
                  </div>
                  <div className="card-subtitle" style={{ marginTop: '4px' }}>
                    {run.model && <span style={{ marginRight: '12px' }}>🧩 {run.model}</span>}
                    {run.durationMs > 0 && <span style={{ marginRight: '12px' }}>⏱ {formatDuration(run.durationMs)}</span>}
                    {run.usage && <span>📊 {formatTokens(run.usage.total_tokens)} tokens</span>}
                  </div>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {relativeTime(run.ts)}
                </span>
              </div>

              <div style={{
                marginTop: '8px',
                fontSize: '13px',
                lineHeight: '1.5',
                color: isError ? '#ef4444' : 'var(--text-secondary, #94a3b8)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {truncated}
                {summaryText.length > 120 && (
                  <span style={{ color: 'var(--accent-primary)', marginLeft: '4px', fontSize: '11px' }}>
                    {isExpanded ? '▲ less' : '▼ more'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {runs.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          No activity recorded yet.
        </div>
      )}
    </>
  )
}
