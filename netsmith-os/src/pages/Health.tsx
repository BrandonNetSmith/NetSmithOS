import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface HealthData {
  cpu: {
    model: string
    cores: number
    usage: number
  }
  memory: {
    total: number
    used: number
    free: number
    percent: number
  }
  disk: {
    total: number
    used: number
    free: number
    percent: number
  }
  uptime: {
    seconds: number
    formatted: string
  }
  services: {
    name: string
    status: string
    uptime: string
  }[]
  system: {
    hostname: string
    platform: string
    release: string
    arch: string
    nodeVersion: string
  }
  timestamp: string
}

interface MetricsHistory {
  cpu: number[]
  memory: number[]
  timestamps: number[]
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function UsageBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div style={{
      width: '100%',
      height: '8px',
      background: 'var(--bg-tertiary)',
      borderRadius: '4px',
      overflow: 'hidden',
      marginTop: '8px'
    }}>
      <div style={{
        width: `${Math.min(100, percent)}%`,
        height: '100%',
        background: color,
        borderRadius: '4px',
        transition: 'width 0.3s ease'
      }} />
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'active' ? '#22c55e' : status === 'inactive' ? '#ef4444' : '#eab308'
  return (
    <span style={{
      display: 'inline-block',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: color,
      marginRight: '8px',
      boxShadow: `0 0 8px ${color}66`
    }} />
  )
}

// ─── Sparkline Component ────────────────────────────────────────────────────
interface SparklineProps {
  data: number[]
  color: string
  label: string
  gradientId: string
}

function Sparkline({ data, color, label, gradientId }: SparklineProps) {
  const SVG_WIDTH = 600
  const SVG_HEIGHT = 64
  const PADDING_TOP = 4
  const PADDING_BOTTOM = 4

  if (data.length < 2) {
    return (
      <div className="model-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Collecting data…</span>
        </div>
        <div style={{
          height: `${SVG_HEIGHT}px`,
          background: 'var(--bg-tertiary)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: '12px',
        }}>
          ⏳ Waiting for samples
        </div>
      </div>
    )
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const current = data[data.length - 1]

  // Scale Y: 0-100% range with padding
  const yRange = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM
  const scaleY = (val: number) => {
    const clamped = Math.max(0, Math.min(100, val))
    return PADDING_TOP + yRange - (clamped / 100) * yRange
  }

  const stepX = SVG_WIDTH / (data.length - 1)

  // Build polyline points
  const points = data.map((val, i) => `${i * stepX},${scaleY(val)}`).join(' ')

  // Build fill polygon (close along the bottom)
  const fillPoints = `0,${SVG_HEIGHT} ${points} ${(data.length - 1) * stepX},${SVG_HEIGHT}`

  return (
    <div className="model-card" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            Min <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{min}%</span>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            Max <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{max}%</span>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            Now <span style={{ color, fontWeight: 700 }}>{current}%</span>
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        preserveAspectRatio="none"
        style={{
          width: '100%',
          height: `${SVG_HEIGHT}px`,
          display: 'block',
          borderRadius: '6px',
          background: 'var(--bg-tertiary)',
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Horizontal reference lines at 25%, 50%, 75% */}
        {[25, 50, 75].map((pct) => (
          <line
            key={pct}
            x1="0"
            y1={scaleY(pct)}
            x2={SVG_WIDTH}
            y2={scaleY(pct)}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}
        {/* Gradient fill */}
        <polygon
          points={fillPoints}
          fill={`url(#${gradientId})`}
        />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Current value dot */}
        <circle
          cx={(data.length - 1) * stepX}
          cy={scaleY(current)}
          r="3"
          fill={color}
          stroke="var(--bg-card)"
          strokeWidth="1.5"
        />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
        <span>{data.length > 1 ? `${Math.round((data.length * 10) / 60)}m ago` : ''}</span>
        <span>now</span>
      </div>
    </div>
  )
}

export default function Health() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [history, setHistory] = useState<MetricsHistory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  useEffect(() => {
    loadHealth()
    const interval = setInterval(loadHealth, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [])

  const loadHealth = async () => {
    try {
      setError(null)
      const [healthRes, historyRes] = await Promise.allSettled([
        fetch('/api/health').then(r => { if (!r.ok) throw new Error(`API returned ${r.status}`); return r.json() }),
        api.getHealthHistory(),
      ])

      if (healthRes.status === 'fulfilled') {
        setHealth(healthRes.value)
      } else {
        throw healthRes.reason
      }

      if (historyRes.status === 'fulfilled') {
        setHistory(historyRes.value)
      }

      setLastRefresh(new Date())
    } catch (err) {
      console.error('Failed to load health:', err)
      setError(err instanceof Error ? err.message : 'Failed to load health data')
    }
  }

  const getUsageColor = (percent: number) => {
    if (percent < 60) return '#22c55e'
    if (percent < 80) return '#eab308'
    return '#ef4444'
  }

  if (!health && !error) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-muted)' }}>
        Loading system health...
      </div>
    )
  }

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
          ⚠️ {error}
        </div>
      )}

      {health && (
        <>
          {/* System Overview */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Hostname</div>
              <div className="stat-value" style={{ fontSize: '18px' }}>{health.system.hostname}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Uptime</div>
              <div className="stat-value accent">{health.uptime.formatted}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Platform</div>
              <div className="stat-value" style={{ fontSize: '14px' }}>{health.system.platform} {health.system.arch}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Kernel</div>
              <div className="stat-value" style={{ fontSize: '12px' }}>{health.system.release}</div>
            </div>
          </div>

          {/* Resource Usage */}
          <div className="section-title" style={{ marginTop: '24px' }}>📊 Resource Usage</div>
          <div className="card-grid">
            {/* CPU Card */}
            <div className="model-card">
              <div className="card-header">
                <div style={{ flex: 1 }}>
                  <div className="card-title">CPU</div>
                  <div className="card-subtitle">{health.cpu.model}</div>
                </div>
                <span style={{
                  fontSize: '24px',
                  fontWeight: 700,
                  color: getUsageColor(health.cpu.usage)
                }}>
                  {health.cpu.usage}%
                </span>
              </div>
              <UsageBar percent={health.cpu.usage} color={getUsageColor(health.cpu.usage)} />
              <div className="card-stats" style={{ marginTop: '12px' }}>
                <div className="card-stat">
                  <span className="card-stat-label">Cores:</span>
                  <span className="card-stat-value">{health.cpu.cores}</span>
                </div>
              </div>
            </div>

            {/* Memory Card */}
            <div className="model-card">
              <div className="card-header">
                <div style={{ flex: 1 }}>
                  <div className="card-title">Memory</div>
                  <div className="card-subtitle">{formatBytes(health.memory.used)} / {formatBytes(health.memory.total)}</div>
                </div>
                <span style={{
                  fontSize: '24px',
                  fontWeight: 700,
                  color: getUsageColor(health.memory.percent)
                }}>
                  {health.memory.percent}%
                </span>
              </div>
              <UsageBar percent={health.memory.percent} color={getUsageColor(health.memory.percent)} />
              <div className="card-stats" style={{ marginTop: '12px' }}>
                <div className="card-stat">
                  <span className="card-stat-label">Free:</span>
                  <span className="card-stat-value">{formatBytes(health.memory.free)}</span>
                </div>
              </div>
            </div>

            {/* Disk Card */}
            <div className="model-card">
              <div className="card-header">
                <div style={{ flex: 1 }}>
                  <div className="card-title">Disk</div>
                  <div className="card-subtitle">{formatBytes(health.disk.used)} / {formatBytes(health.disk.total)}</div>
                </div>
                <span style={{
                  fontSize: '24px',
                  fontWeight: 700,
                  color: getUsageColor(health.disk.percent)
                }}>
                  {health.disk.percent}%
                </span>
              </div>
              <UsageBar percent={health.disk.percent} color={getUsageColor(health.disk.percent)} />
              <div className="card-stats" style={{ marginTop: '12px' }}>
                <div className="card-stat">
                  <span className="card-stat-label">Free:</span>
                  <span className="card-stat-value">{formatBytes(health.disk.free)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* System Pulse — sparkline history */}
          <div className="section-title" style={{ marginTop: '28px' }}>📈 System Pulse</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Sparkline
              data={history?.cpu ?? []}
              color="#10b981"
              label="CPU Usage"
              gradientId="sparkline-cpu-grad"
            />
            <Sparkline
              data={history?.memory ?? []}
              color="#3b82f6"
              label="Memory Usage"
              gradientId="sparkline-mem-grad"
            />
          </div>

          {/* Services */}
          <div className="section-title" style={{ marginTop: '28px' }}>⚡ Services</div>
          <div className="card-grid">
            {health.services.map((service, i) => (
              <div className="session-card" key={i}>
                <div className="card-header">
                  <div>
                    <div className="card-title" style={{ display: 'flex', alignItems: 'center' }}>
                      <StatusDot status={service.status} />
                      {service.name}
                    </div>
                  </div>
                  <span className={`status-badge ${service.status === 'active' ? 'active' : 'inactive'}`}>
                    {service.status}
                  </span>
                </div>
                {service.uptime && (
                  <div className="card-stats">
                    <div className="card-stat">
                      <span className="card-stat-label">Running:</span>
                      <span className="card-stat-value" style={{ color: 'var(--accent-primary)' }}>
                        {service.uptime}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Runtime Info */}
          <div className="section-title" style={{ marginTop: '28px' }}>🔧 Runtime</div>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Node.js</div>
              <div className="stat-value" style={{ fontSize: '14px' }}>{health.system.nodeVersion}</div>
            </div>
          </div>
        </>
      )}

      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '24px' }}>
        Last refreshed: {lastRefresh.toLocaleTimeString()} · Auto-refresh every 10s
      </div>
    </>
  )
}
