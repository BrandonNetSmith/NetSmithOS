import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { CostSummary, AgentCost } from '../api/types'

function fmtCost(n: number): string {
  if (n >= 1) return '$' + n.toFixed(2)
  if (n >= 0.01) return '$' + n.toFixed(3)
  if (n > 0) return '$' + n.toFixed(4)
  return '$0.00'
}

function fmtPct(value: number, total: number): string {
  if (total <= 0) return '0%'
  return ((value / total) * 100).toFixed(1) + '%'
}

function costColor(cost: number, max: number): string {
  if (max <= 0) return '#22c55e'
  const ratio = cost / max
  if (ratio < 0.3) return '#22c55e'
  if (ratio < 0.7) return '#eab308'
  return '#ef4444'
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'Never'
  const diff = Date.now() - ts
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  return Math.floor(diff / 86400000) + 'd ago'
}

function BarRow({ label, value, max, total }: { label: string; value: number; max: number; total: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  const color = costColor(value, max)
  return (
    <div className="cost-model-row">
      <span className="cost-model-name" title={label}>{label}</span>
      <div className="cost-bar-container">
        <div
          className="cost-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="cost-model-amount" style={{ minWidth: '70px', textAlign: 'right' }}>
        {fmtCost(value)}
      </span>
      <span style={{ minWidth: '50px', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>
        {fmtPct(value, total)}
      </span>
    </div>
  )
}

export default function CostExplorer() {
  const [summary, setSummary] = useState<CostSummary | null>(null)
  const [agents, setAgents] = useState<AgentCost[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = async () => {
    try {
      setError(null)
      const [s, a] = await Promise.all([api.getCostSummary(), api.getCostsByAgent()])
      setSummary(s)
      setAgents(a)
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Failed to load costs:', err)
      setError(err instanceof Error ? err.message : 'Failed to load cost data')
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!summary && !error) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-muted)' }}>
        Loading cost data...
      </div>
    )
  }

  const sortedAgents = [...agents].sort((a, b) => b.totalCost - a.totalCost)
  const maxAgentCost = sortedAgents.length > 0 ? sortedAgents[0].totalCost : 1
  const totalAgentSpend = sortedAgents.reduce((s, a) => s + a.totalCost, 0)

  const modelEntries = summary ? Object.entries(summary.byModel).sort(([, a], [, b]) => b - a) : []
  const maxModelCost = modelEntries.length > 0 ? modelEntries[0][1] : 1
  const totalModelSpend = modelEntries.reduce((s, [, v]) => s + v, 0)

  const burnColor = summary ? costColor(summary.burnRate, 10) : '#22c55e'

  return (
    <>
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)',
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

      {summary && (
        <>
          {/* Summary Stats */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Today</div>
              <div className="stat-value accent">{fmtCost(summary.today)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">This Week</div>
              <div className="stat-value">{fmtCost(summary.thisWeek)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">This Month</div>
              <div className="stat-value">{fmtCost(summary.thisMonth)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Burn Rate</div>
              <div className="stat-value" style={{ color: burnColor }}>
                {fmtCost(summary.burnRate)}<span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/day</span>
              </div>
            </div>
          </div>

          {/* By Agent */}
          <div className="section-title" style={{ marginTop: '24px' }}>👤 Spend by Agent</div>
          <div className="model-card" style={{ padding: '16px' }}>
            {sortedAgents.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No agent cost data</div>
            )}
            {sortedAgents.map(agent => (
              <BarRow
                key={agent.agentId}
                label={agent.agentId}
                value={agent.totalCost}
                max={maxAgentCost}
                total={totalAgentSpend}
              />
            ))}
          </div>

          {/* By Model */}
          <div className="section-title" style={{ marginTop: '24px' }}>🤖 Spend by Model</div>
          <div className="model-card" style={{ padding: '16px' }}>
            {modelEntries.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No model cost data</div>
            )}
            {modelEntries.map(([model, cost]) => (
              <BarRow
                key={model}
                label={model}
                value={cost}
                max={maxModelCost}
                total={totalModelSpend}
              />
            ))}
          </div>

          {/* Per-Agent Detail Cards */}
          <div className="section-title" style={{ marginTop: '28px' }}>📋 Agent Details</div>
          <div className="card-grid">
            {sortedAgents.map(agent => {
              const isExpanded = expanded.has(agent.agentId)
              const agentModelEntries = Object.entries(agent.byModel).sort(([, a], [, b]) => b - a)
              const agentMaxModel = agentModelEntries.length > 0 ? agentModelEntries[0][1] : 1
              const agentModelTotal = agentModelEntries.reduce((s, [, v]) => s + v, 0)

              return (
                <div className="model-card" key={agent.agentId}>
                  <div
                    className="card-header"
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleExpand(agent.agentId)}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="card-title">{agent.agentId}</div>
                      <div className="card-subtitle">
                        {agent.runCount} runs · Last: {timeAgo(agent.lastRun)}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '20px',
                      fontWeight: 700,
                      color: costColor(agent.totalCost, maxAgentCost)
                    }}>
                      {fmtCost(agent.totalCost)}
                    </span>
                  </div>
                  <div className="card-stats">
                    <div className="card-stat">
                      <span className="card-stat-label">Today:</span>
                      <span className="card-stat-value">{fmtCost(agent.todayCost)}</span>
                    </div>
                    <div className="card-stat">
                      <span className="card-stat-label">Month:</span>
                      <span className="card-stat-value">{fmtCost(agent.monthCost)}</span>
                    </div>
                    <div className="card-stat">
                      <span className="card-stat-label">Runs:</span>
                      <span className="card-stat-value">{agent.runCount}</span>
                    </div>
                  </div>
                  {isExpanded && agentModelEntries.length > 0 && (
                    <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-primary)', paddingTop: '12px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Model Breakdown
                      </div>
                      {agentModelEntries.map(([model, cost]) => (
                        <BarRow
                          key={model}
                          label={model}
                          value={cost}
                          max={agentMaxModel}
                          total={agentModelTotal}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '24px' }}>
        Last refreshed: {lastRefresh.toLocaleTimeString()} · Auto-refresh every 30s
      </div>
    </>
  )
}
