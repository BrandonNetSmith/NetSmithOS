import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { AgentAvatar } from '../components/AgentAvatar';
import type { Ticket, TicketStats } from '../api/types';
import '../styles/tickets.css';

const STATUSES = ['open', 'in_progress', 'review', 'done'] as const;
const STATUS_LABELS: Record<string, string> = { open: 'Open', in_progress: 'In Progress', review: 'Review', done: 'Done' };
const PRIORITY_COLORS: Record<string, string> = { urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#6b7280' };
const AGENTS = [
  { id: 'main', name: 'Tim' }, { id: 'elon', name: 'Elon' }, { id: 'gary', name: 'Gary' },
  { id: 'warren', name: 'Warren' }, { id: 'steve', name: 'Steve' }, { id: 'noah', name: 'Noah' },
  { id: 'clay', name: 'Clay' }, { id: 'calvin', name: 'Calvin' }, { id: 'human', name: 'Brandon' },
];

interface CreateModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateTicketModal({ onClose, onCreated }: CreateModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.createTicket({
        title: title.trim(),
        description: description.trim() || undefined,
        assignee_id: assigneeId || undefined,
        priority,
        due_date: dueDate || undefined,
      });
      onCreated();
      onClose();
    } catch {
      // keep modal open so the user can retry without losing form state
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ticket-modal-overlay" onClick={onClose}>
      <div className="ticket-modal" onClick={e => e.stopPropagation()}>
        <div className="ticket-modal-header">
          <h3>Create Ticket</h3>
          <button className="ticket-modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="ticket-form">
          <label>
            <span>Title *</span>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to be done?" autoFocus />
          </label>
          <label>
            <span>Description</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Details..." rows={3} />
          </label>
          <div className="ticket-form-row">
            <label>
              <span>Assignee</span>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                <option value="">Unassigned</option>
                {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label>
              <span>Priority</span>
              <select value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label>
              <span>Due Date</span>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </label>
          </div>
          <div className="ticket-form-actions">
            <button type="button" onClick={onClose} className="ticket-btn-cancel">Cancel</button>
            <button type="submit" disabled={saving || !title.trim()} className="ticket-btn-create">
              {saving ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface TicketCardProps {
  ticket: Ticket;
  onStatusChange: (id: string, status: string) => void;
  onSelect: (ticket: Ticket) => void;
}

function TicketCard({ ticket, onSelect }: TicketCardProps) {
  const isOverdue = ticket.due_date && new Date(ticket.due_date) < new Date() && ticket.status !== 'done';
  return (
    <div className={`ticket-card ${isOverdue ? 'ticket-overdue' : ''}`} onClick={() => onSelect(ticket)}>
      <div className="ticket-card-header">
        <span className="ticket-priority-dot" style={{ background: PRIORITY_COLORS[ticket.priority] || '#6b7280' }} title={ticket.priority} />
        <span className="ticket-card-title">{ticket.title}</span>
      </div>
      {ticket.description && <p className="ticket-card-desc">{ticket.description.slice(0, 80)}{ticket.description.length > 80 ? '...' : ''}</p>}
      <div className="ticket-card-footer">
        {ticket.assignee_id && (
          <div className="ticket-card-assignee">
            <AgentAvatar agentId={ticket.assignee_id} size={20} />
            <span>{ticket.assignee_name || ticket.assignee_id}</span>
          </div>
        )}
        {ticket.due_date && (
          <span className={`ticket-card-due ${isOverdue ? 'overdue-text' : ''}`}>
            {new Date(ticket.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  );
}

interface DetailPanelProps {
  ticket: Ticket;
  onClose: () => void;
  onUpdate: () => void;
}

function TicketDetailPanel({ ticket, onClose, onUpdate }: DetailPanelProps) {
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);
  const [assigneeId, setAssigneeId] = useState(ticket.assignee_id || '');
  const [saving, setSaving] = useState(false);

  const save = async (field: string, value: string | null) => {
    setSaving(true);
    try {
      const payload: any = { [field]: value };
      if (field === 'assignee_id') {
        const agent = AGENTS.find(a => a.id === value);
        payload.assignee_name = agent?.name || null;
      }
      await api.updateTicket(ticket.id, payload);
      onUpdate();
    } catch {
      // swallow to avoid disrupting inline editing UI
    } finally { setSaving(false); }
  };

  return (
    <div className="ticket-detail-panel">
      <div className="ticket-detail-header">
        <h3>{ticket.title}</h3>
        <button onClick={onClose} className="ticket-modal-close">✕</button>
      </div>
      <div className="ticket-detail-body">
        {ticket.description && <p className="ticket-detail-desc">{ticket.description}</p>}
        <div className="ticket-detail-fields">
          <label>
            <span>Status</span>
            <select value={status} onChange={e => { setStatus(e.target.value as Ticket['status']); save('status', e.target.value); }}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select value={priority} onChange={e => { setPriority(e.target.value as Ticket['priority']); save('priority', e.target.value); }}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label>
            <span>Assignee</span>
            <select value={assigneeId} onChange={e => { setAssigneeId(e.target.value); save('assignee_id', e.target.value); }}>
              <option value="">Unassigned</option>
              {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        {ticket.meeting_id && <p className="ticket-detail-meeting">📋 Created from meeting</p>}
        {ticket.tags && ticket.tags.length > 0 && (
          <div className="ticket-detail-tags">
            {ticket.tags.map((t, i) => <span key={i} className="ticket-tag">{t}</span>)}
          </div>
        )}
        <div className="ticket-detail-meta">
          <span>Created {new Date(ticket.created_at).toLocaleDateString()}</span>
          {saving && <span className="ticket-saving">Saving...</span>}
        </div>
        <button className="ticket-btn-delete" onClick={async () => {
          if (confirm('Delete this ticket?')) {
            await api.deleteTicket(ticket.id);
            onUpdate();
            onClose();
          }
        }}>Delete Ticket</button>
      </div>
    </div>
  );
}

export default function TicketBoard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [tRes, sRes] = await Promise.all([api.getTickets(), api.getTicketStats()]);
      setTickets(tRes.tickets);
      setStats(sRes);
    } catch {
      // leave prior data visible on refresh errors
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.updateTicket(id, { status: newStatus as Ticket['status'] });
      load();
    } catch {
      // keep UI stable if status update fails
    }
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = tickets.filter(t => {
    if (filterAssignee && t.assignee_id !== filterAssignee) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (
      normalizedQuery &&
      !(`${t.title} ${t.description || ''}`.toLowerCase().includes(normalizedQuery))
    ) {
      return false;
    }
    return true;
  });

  if (loading) {
    return <div className="tickets-loading">Loading tickets...</div>;
  }

  return (
    <div className="tickets-container">
      {/* Stats Bar */}
      <div className="tickets-stats-bar">
        <div className="ticket-stat"><span className="ticket-stat-num">{stats?.byStatus?.open || 0}</span><span className="ticket-stat-label">Open</span></div>
        <div className="ticket-stat"><span className="ticket-stat-num">{stats?.byStatus?.in_progress || 0}</span><span className="ticket-stat-label">In Progress</span></div>
        <div className="ticket-stat ticket-stat-warn"><span className="ticket-stat-num">{stats?.overdue || 0}</span><span className="ticket-stat-label">Overdue</span></div>
        <div className="ticket-stat ticket-stat-good"><span className="ticket-stat-num">{stats?.completedThisWeek || 0}</span><span className="ticket-stat-label">Done This Week</span></div>
      </div>

      {/* Toolbar */}
      <div className="tickets-toolbar">
        <div className="tickets-toolbar-left">
          <button className={`tickets-view-btn ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')}>⬛ Kanban</button>
          <button className={`tickets-view-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>☰ List</button>
          <input
            className="tickets-filter"
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search title/description"
            aria-label="Search tickets"
          />
          <select className="tickets-filter" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
            <option value="">All Assignees</option>
            {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="tickets-filter" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <button className="ticket-btn-create" onClick={() => setShowCreate(true)}>+ New Ticket</button>
      </div>

      {/* Kanban View */}
      {view === 'kanban' && (
        <div className="tickets-kanban">
          {STATUSES.map(status => {
            const col = filtered.filter(t => t.status === status);
            return (
              <div key={status} className="kanban-column">
                <div className="kanban-column-header">
                  <span className="kanban-column-title">{STATUS_LABELS[status]}</span>
                  <span className="kanban-column-count">{col.length}</span>
                </div>
                <div className="kanban-column-body">
                  {col.map(t => (
                    <TicketCard key={t.id} ticket={t} onStatusChange={handleStatusChange} onSelect={setSelected} />
                  ))}
                  {col.length === 0 && <div className="kanban-empty">No tickets</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="tickets-list">
          <table className="tickets-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Title</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Due Date</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="tickets-table-row" onClick={() => setSelected(t)}>
                  <td><span className="ticket-priority-dot" style={{ background: PRIORITY_COLORS[t.priority] }} />{t.priority}</td>
                  <td>{t.title}</td>
                  <td><span className={`ticket-status-badge status-${t.status}`}>{STATUS_LABELS[t.status]}</span></td>
                  <td>{t.assignee_name || '—'}</td>
                  <td>{t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}</td>
                  <td>{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="tickets-table-empty">No tickets found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && <CreateTicketModal onClose={() => setShowCreate(false)} onCreated={load} />}

      {/* Detail Panel */}
      {selected && <TicketDetailPanel ticket={selected} onClose={() => setSelected(null)} onUpdate={load} />}
    </div>
  );
}
