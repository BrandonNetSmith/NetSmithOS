import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface StandupEntry {
  filename: string
  date: string
  preview: string
  content?: string
}

interface AgentRoleInfo {
  emoji: string
  role: string
  color: string
}

const AGENT_ROLES: Record<string, AgentRoleInfo> = {
  'Tim': { emoji: '🧠', role: 'COO', color: '#6366f1' },
  'Tina': { emoji: '🧠', role: 'COO', color: '#6366f1' },
  'Elon': { emoji: '🔨', role: 'CTO', color: '#10b981' },
  'Gary': { emoji: '📣', role: 'CMO', color: '#f59e0b' },
  'Warren': { emoji: '💰', role: 'CRO', color: '#22c55e' },
  'Steve': { emoji: '🎨', role: 'CPO', color: '#ec4899' },
  'Noah': { emoji: '📱', role: 'SMM', color: '#8b5cf6' },
  'Clay': { emoji: '🦞', role: 'Community', color: '#f97316' },
  'Calvin': { emoji: '🦞', role: 'Community', color: '#f97316' },
  'Brandon': { emoji: '👤', role: 'CEO', color: '#64748b' },
}

const AGENT_PATTERN = new RegExp(`\\b(${Object.keys(AGENT_ROLES).join('|')})\\b`, 'g')

function renderWithBadges(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  AGENT_PATTERN.lastIndex = 0
  while ((match = AGENT_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index))
    }
    const name = match[1]
    const info = AGENT_ROLES[name]
    result.push(
      <span key={`badge-${match.index}`}>
        {name}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          background: `${info.color}20`,
          border: `1px solid ${info.color}40`,
          color: info.color,
          fontSize: '10px',
          fontWeight: 600,
          padding: '1px 5px',
          borderRadius: '4px',
          marginLeft: '4px',
          verticalAlign: 'middle',
          lineHeight: 1.4,
        }}>
          {info.emoji} {info.role}
        </span>
      </span>
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex))
  }

  return result
}

function processChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') {
    return renderWithBadges(children)
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === 'string') {
        const parts = renderWithBadges(child)
        return parts.length === 1 && typeof parts[0] === 'string'
          ? parts[0]
          : <span key={i}>{parts}</span>
      }
      return child
    })
  }
  return children
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p>{processChildren(children)}</p>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li>{processChildren(children)}</li>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1>{processChildren(children)}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2>{processChildren(children)}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3>{processChildren(children)}</h3>
  ),
}

export default function Standup({ agents = [] }: { agents?: any[] }) {
  const [standups, setStandups] = useState<StandupEntry[]>([])
  const [selectedStandup, setSelectedStandup] = useState<StandupEntry | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['main'])
  const [streamEvents, setStreamEvents] = useState<any[]>([])
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [streamComplete, setStreamComplete] = useState(false)
  const streamRef = useRef<EventSource | null>(null)

  useEffect(() => {
    loadStandups()
  }, [])

  const loadStandups = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/standups')
      if (!res.ok) throw new Error('Failed to load standups')
      const data = await res.json()
      setStandups(data.standups || [])
    } catch (err) {
      console.error('Failed to load standups:', err)
      setError(err instanceof Error ? err.message : 'Failed to load standups')
    } finally {
      setIsLoading(false)
    }
  }

  const loadStandupContent = async (standup: StandupEntry) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/standups/${standup.filename}`)
      if (!res.ok) throw new Error('Failed to load standup')
      const data = await res.json()
      setSelectedStandup({ ...standup, content: data.content })
    } catch (err) {
      console.error('Failed to load standup:', err)
      setError(err instanceof Error ? err.message : 'Failed to load standup')
    } finally {
      setIsLoading(false)
    }
  }

  const startStandupStream = (standupId: string) => {
    setStreamEvents([])
    setStreamComplete(false)
    setStreamingId(standupId)
    if (streamRef.current) { streamRef.current.close(); streamRef.current = null; }
    const es = new EventSource(`/api/standups/stream/${standupId}`)
    streamRef.current = es
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data)
        if (evt.type === 'complete') {
          setStreamComplete(true)
          es.close()
          streamRef.current = null
          loadStandups()
        } else {
          setStreamEvents(prev => [...prev, evt])
        }
      } catch {}
    }
    es.onerror = () => { es.close(); streamRef.current = null; setStreamComplete(true); }
  }

  const toggleAgent = (id: string) => {
    setSelectedAgents(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])
  }

  const handleNewStandup = async () => {
    if (!newTopic.trim()) return

    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/standups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: newTopic, agents: selectedAgents })
      })

      if (!res.ok) throw new Error('Failed to create standup')

      const data = await res.json()

      setShowNewModal(false)
      setNewTopic('')
      // Start streaming if server supports it
      if (data.id) {
        startStandupStream(data.id)
      } else {
        await loadStandups()
        setSelectedStandup({
          filename: data.filename,
          date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          preview: newTopic,
          content: data.content
        })
      }
    } catch (err) {
      console.error('Failed to create standup:', err)
      setError(err instanceof Error ? err.message : 'Failed to create standup')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Executive Standup</h1>
        <p className="page-subtitle">Kick off meetings with the chiefs and review past transcripts</p>
        <div className="header-actions">
          <button className="btn" onClick={() => { setSelectedStandup(null); loadStandups(); }}>
            📁 Meeting Archive
          </button>
          <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>
            + New Standup
          </button>
        </div>
      </div>

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
          ⚠️ {error}
        </div>
      )}

      {showNewModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            width: '500px',
            maxWidth: '90vw'
          }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>
              Create Standup
            </h3>
            <p style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
              Enter a topic or agenda for today's standup meeting.
            </p>
            <textarea
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="e.g., Weekly sync, Project review, Sprint planning..."
              style={{
                width: '100%',
                minHeight: '100px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                resize: 'vertical',
                marginBottom: '16px'
              }}
            />
            {agents.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em' }}>ATTENDEES</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {agents.map((a: any) => {
                    const id = a.agentId || a.id
                    const isSelected = selectedAgents.includes(id)
                    return (
                      <button
                        key={id}
                        onClick={() => toggleAgent(id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                          background: isSelected ? 'rgba(16,185,129,0.15)' : 'var(--bg-hover)',
                          border: isSelected ? '1px solid rgba(16,185,129,0.5)' : '1px solid var(--border-color)',
                          color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)',
                          fontSize: 12, transition: 'all 0.15s',
                        }}
                      >
                        <span>{a.emoji || '⬡'}</span>
                        <span>{a.name || id}</span>
                        {isSelected && <span style={{ opacity: 0.6 }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowNewModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleNewStandup}
                disabled={isLoading || !newTopic.trim()}
              >
                {isLoading ? 'Starting...' : 'Start Standup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedStandup ? (
        <div>
          <button
            className="btn"
            onClick={() => setSelectedStandup(null)}
            style={{ marginBottom: '16px' }}
          >
            ← Back to Archive
          </button>
          {isLoading ? (
            <div style={{ padding: '24px', color: 'var(--text-muted)' }}>
              Loading...
            </div>
          ) : (
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {selectedStandup.content || ''}
              </ReactMarkdown>
            </div>
          )}
        </div>
      ) : (
        <div className="standup-list">
          {isLoading ? (
            <div style={{ padding: '24px', color: 'var(--text-muted)', textAlign: 'center' }}>
              Loading standups...
            </div>
          ) : standups.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <p>No standups yet. Start your first meeting!</p>
            </div>
          ) : (
            standups.map((standup, i) => (
              <div
                key={i}
                className="standup-item"
                onClick={() => loadStandupContent(standup)}
              >
                <div className="standup-date">{standup.date}</div>
                <div className="standup-preview">{standup.preview}</div>
              </div>
            ))
          )}
        </div>
      )}
      {/* Live Standup Stream */}
      {streamingId && (
        <div style={{ marginTop: 24 }}>
          <div className="section-title">
            Live Standup {streamComplete ? '✅ Complete' : <span style={{ animation: 'pulse 1.5s infinite' }}>⟳ In progress...</span>}
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-hover)', borderRadius: 8, padding: '16px', maxHeight: 400, overflowY: 'auto' }}>
            {streamEvents.length === 0 && !streamComplete && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Waiting for agents to respond...</div>
            )}
            {streamEvents.map((evt, i) => {
              const roleInfo = evt.agentName ? AGENT_ROLES[evt.agentName] : null
              return (
                <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < streamEvents.length - 1 ? '1px solid var(--bg-hover)' : 'none' }}>
                  {evt.agentName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 18 }}>{roleInfo?.emoji || '⬡'}</span>
                      <span style={{ fontWeight: 700, color: roleInfo?.color || 'var(--text-primary)', fontSize: 13 }}>{evt.agentName}</span>
                      {roleInfo && <span style={{ fontSize: 10, color: 'var(--text-muted)', background: `${roleInfo.color}20`, padding: '1px 6px', borderRadius: 4 }}>{roleInfo.role}</span>}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{evt.content || evt.text || JSON.stringify(evt)}</div>
                </div>
              )
            })}
          </div>
          {streamComplete && (
            <button onClick={() => setStreamingId(null)} style={{ marginTop: 12, fontSize: 12, background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </>
  )
}
