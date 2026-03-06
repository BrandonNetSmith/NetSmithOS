import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { AgentAvatar } from '../components/AgentAvatar'

type AgentStatus = 'Active' | 'Scaffolded' | 'Future' | 'Deprecated'

// Map display names to agentIds for drill-through + avatar
const NAME_TO_AGENT_ID: Record<string, string> = {
  tim: 'main', elon: 'elon', gary: 'gary', warren: 'warren',
  steve: 'steve', noah: 'noah', clay: 'clay', calvin: 'calvin',
}

interface OrgAgent {
  name: string
  role: string
  title: string
  model?: string
  status: AgentStatus
  avatar: string
  reports?: OrgAgent[]
}

const BASE_TREE: OrgAgent = {
  name: 'Brandon',
  role: 'CEO',
  title: 'Human Overlord',
  status: 'Active',
  avatar: '👤',
  reports: [
    {
      name: 'Tim',
      role: 'COO',
      title: 'Chief Operating Officer',
      model: 'Gemini 2.5 Flash',
      status: 'Active',
      avatar: '🧠',
      reports: [
        { name: 'Elon', role: 'CTO', title: 'Chief Technology Officer', model: 'Claude Opus 4.6', status: 'Active', avatar: '🔨' },
        {
          name: 'Gary', role: 'CMO', title: 'Chief Marketing Officer', model: 'Claude Sonnet 4.6', status: 'Active', avatar: '📣',
          reports: [{ name: 'Noah', role: 'SMM', title: 'Social Media Manager', model: 'Claude Sonnet 4.6', status: 'Active', avatar: '📱' }],
        },
        {
          name: 'Warren', role: 'CRO', title: 'Chief Revenue Officer', model: 'Claude Sonnet 4.6', status: 'Active', avatar: '💰',
          reports: [{ name: 'Clay', role: 'Community', title: 'Discord Community Support', model: 'Gemini 2.0 Flash', status: 'Active', avatar: '🦞' }],
        },
        { name: 'Steve', role: 'CPO', title: 'Chief Product Officer', model: 'Claude Sonnet 4.6', status: 'Active', avatar: '🎨' },
      ],
    },
  ],
}

function overlayApiData(node: OrgAgent, apiMap: Map<string, { model: string | null; status: string }>): OrgAgent {
  const live = apiMap.get(node.name.toLowerCase())
  const overlaid: OrgAgent = { ...node }
  if (live) {
    const s = live.status
    if (s === 'active' || s === 'idle' || s === 'busy') overlaid.status = 'Active'
    else if (s === 'error') overlaid.status = 'Active'
  }
  if (node.reports) overlaid.reports = node.reports.map(r => overlayApiData(r, apiMap))
  return overlaid
}

function countByStatus(agent: OrgAgent, status: AgentStatus): number {
  let count = agent.status === status ? 1 : 0
  if (agent.reports) for (const r of agent.reports) count += countByStatus(r, status)
  return count
}

function countAll(agent: OrgAgent): number {
  let count = 1
  if (agent.reports) for (const r of agent.reports) count += countAll(r)
  return count
}

function collectNames(agent: OrgAgent, set: Set<string>) {
  set.add(agent.name)
  agent.reports?.forEach(r => collectNames(r, set))
}

function filterByStatus(node: OrgAgent, statusFilter: AgentStatus | null): OrgAgent | null {
  if (!statusFilter) return node
  const matchingReports = (node.reports || [])
    .map(r => filterByStatus(r, statusFilter))
    .filter(Boolean) as OrgAgent[]
  if (node.status === statusFilter || matchingReports.length > 0) {
    return { ...node, reports: matchingReports }
  }
  return null
}

interface AgentCardProps {
  agent: OrgAgent
  expanded: boolean
  onToggle?: () => void
  onDrill?: () => void
  hasChildren?: boolean
}

function AgentCard({ agent, expanded, onToggle, onDrill, hasChildren }: AgentCardProps) {
  const agentId = NAME_TO_AGENT_ID[agent.name.toLowerCase()]
  const modelColor = agent.model
    ? agent.model.toLowerCase().includes('gemini') ? '#f59e0b'
    : agent.model.toLowerCase().includes('gpt') || agent.model.toLowerCase().includes('openai') ? '#10a37f'
    : '#6366f1'
    : undefined

  return (
    <div
      className="agent-card"
      style={{ width: '200px', textAlign: 'center', cursor: agentId && onDrill ? 'pointer' : 'default' }}
      onClick={agentId && onDrill ? () => onDrill() : undefined}
      title={agentId && onDrill ? `Open ${agent.name}'s DrillView` : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
        {agentId ? (
          <AgentAvatar agentId={agentId} emoji={agent.avatar} size={44} />
        ) : (
          <span style={{ fontSize: 32 }}>{agent.avatar}</span>
        )}
      </div>
      <div className="card-title">{agent.name}</div>
      <div className="card-subtitle">{agent.role} • {agent.title}</div>
      {agent.model && (
        <div style={{ display: 'inline-block', fontSize: '11px', color: modelColor, background: modelColor ? `${modelColor}18` : undefined, border: modelColor ? `1px solid ${modelColor}40` : undefined, borderRadius: '4px', padding: '1px 6px', marginTop: '6px' }}>
          {agent.model}
        </div>
      )}
      <div style={{ marginTop: '8px' }}>
        <span className={`status-badge ${agent.status.toLowerCase()}`}>{agent.status}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
        {hasChildren && (
          <button
            onClick={e => { e.stopPropagation(); onToggle && onToggle(); }}
            style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-color)', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}
          >
            {expanded ? '▼ Collapse' : '▶ Expand'}
          </button>
        )}
      </div>
    </div>
  )
}

interface OrgChartProps {
  onDrill?: (agentId: string) => void
}

export default function OrgChart({ onDrill }: OrgChartProps) {
  const [orgTree, setOrgTree] = useState<OrgAgent>(BASE_TREE)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['Brandon', 'Tim']))
  const [statusFilter, setStatusFilter] = useState<AgentStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAgents() }, [])

  const loadAgents = async () => {
    try {
      const agents = await api.getAgents()
      const apiMap = new Map<string, { model: string | null; status: string }>()
      for (const a of agents as any[]) {
        const key = (a.name || a.id || a.agentId || '').toLowerCase()
        if (key) apiMap.set(key, { model: a.model || null, status: a.status || 'idle' })
      }
      setOrgTree(overlayApiData(BASE_TREE, apiMap))
    } catch { /* use default */ } finally { setLoading(false) }
  }

  const toggleNode = (name: string) => {
    const next = new Set(expandedNodes)
    if (next.has(name)) next.delete(name); else next.add(name)
    setExpandedNodes(next)
  }

  const expandAll = () => { const all = new Set<string>(); collectNames(orgTree, all); setExpandedNodes(all) }
  const collapseAll = () => setExpandedNodes(new Set())

  const renderAgent = (agent: OrgAgent, level: number = 0): JSX.Element => {
    const hasChildren = !!(agent.reports && agent.reports.length > 0)
    const isExpanded = expandedNodes.has(agent.name)
    const agentId = NAME_TO_AGENT_ID[agent.name.toLowerCase()]

    return (
      <div key={agent.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <AgentCard
          agent={agent}
          expanded={isExpanded}
          onToggle={hasChildren ? () => toggleNode(agent.name) : undefined}
          onDrill={agentId && onDrill ? () => onDrill(agentId) : undefined}
          hasChildren={hasChildren}
        />
        {hasChildren && isExpanded && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '24px', position: 'relative', paddingTop: '16px' }}>
            <div style={{ position: 'absolute', top: 0, left: '50%', width: '2px', height: '16px', background: 'var(--border-color)' }} />
            {agent.reports!.map(report => renderAgent(report, level + 1))}
          </div>
        )}
      </div>
    )
  }

  const totalAgents = countAll(orgTree)
  const activeCount = countByStatus(orgTree, 'Active')
  const scaffoldedCount = countByStatus(orgTree, 'Scaffolded')
  const displayTree = filterByStatus(orgTree, statusFilter) || orgTree

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading org chart...</div>

  return (
    <>
      <div className="stats-row">
        <div className={`stat-card ${statusFilter === null ? 'stat-active-filter' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setStatusFilter(null)}>
          <div className="stat-label">Total Agents</div>
          <div className="stat-value">{totalAgents}</div>
        </div>
        <div className={`stat-card ${statusFilter === 'Active' ? 'stat-active-filter' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setStatusFilter(f => f === 'Active' ? null : 'Active')}>
          <div className="stat-label">Active</div>
          <div className="stat-value accent">{activeCount}</div>
        </div>
        <div className={`stat-card ${statusFilter === 'Scaffolded' ? 'stat-active-filter' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setStatusFilter(f => f === 'Scaffolded' ? null : 'Scaffolded')}>
          <div className="stat-label">Scaffolded</div>
          <div className="stat-value">{scaffoldedCount}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button className="btn" onClick={expandAll}>Expand All</button>
        <button className="btn" onClick={collapseAll}>Collapse All</button>
        {statusFilter && (
          <span style={{ fontSize: '12px', color: 'var(--accent-primary)', padding: '4px 10px', background: 'rgba(16,185,129,0.1)', borderRadius: 4, border: '1px solid rgba(16,185,129,0.3)' }}>
            Filtered: {statusFilter} — <button onClick={() => setStatusFilter(null)} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: 0 }}>✕</button>
          </span>
        )}
      </div>

      <div className="org-chart">{renderAgent(displayTree)}</div>

      <div className="legend">
        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--status-active)' }} />Active</div>
        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--status-scaffolded)' }} />Scaffolded</div>
        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--status-future)' }} />Future</div>
        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--status-deprecated)' }} />Deprecated</div>
      </div>
    </>
  )
}
