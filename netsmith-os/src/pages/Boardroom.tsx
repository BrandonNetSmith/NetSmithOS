import { useState, useEffect } from 'react';
import type { Agent } from '../api/types';
import { AgentAvatar } from '../components/AgentAvatar';
import '../styles/boardroom.css';

interface BoardroomProps {
  agents: Agent[];
  onDrill: (agentId: string) => void;
}

interface SeatConfig {
  agentId: string;
  name: string;
  title: string;
  position: 'head' | 'left' | 'right' | 'left2' | 'right2' | 'left3' | 'right3';
  isHuman?: boolean;
}

const SEATS: SeatConfig[] = [
  { agentId: 'brandon', name: 'Brandon', title: 'CEO', position: 'head', isHuman: true },
  { agentId: 'main', name: 'Tim Cook', title: 'COO', position: 'left' },
  { agentId: 'elon', name: 'Elon Musk', title: 'CTO', position: 'right' },
  { agentId: 'gary', name: 'Gary Vee', title: 'CMO', position: 'left2' },
  { agentId: 'warren', name: 'Warren Buffett', title: 'CRO', position: 'right2' },
  { agentId: 'steve', name: 'Steve Jobs', title: 'CPO', position: 'left3' },
  { agentId: 'noah', name: 'Noah Kagan', title: 'SMM', position: 'right3' },
];

function SeatCard({ seat, agent, onDrill }: { seat: SeatConfig; agent: Agent | undefined; onDrill: (id: string) => void }) {
  const status = seat.isHuman ? 'active' : (agent?.status || 'idle');
  const isActive = status === 'active' || status === 'busy';
  const emoji = agent?.emoji;

  return (
    <div
      className={`boardroom-seat boardroom-seat-${seat.position} ${isActive ? 'seat-active' : 'seat-idle'}`}
      onClick={() => !seat.isHuman && onDrill(seat.agentId)}
      title={seat.isHuman ? seat.name : `View ${seat.name}`}
    >
      <div className="seat-avatar-wrap">
        {seat.isHuman ? (
          <span style={{ fontSize: 32 }}>👤</span>
        ) : (
          <AgentAvatar agentId={seat.agentId} emoji={emoji} size={52} />
        )}
        <span className={`seat-status-dot ${isActive ? 'dot-active' : 'dot-idle'}`} />
      </div>
      <div className="seat-info">
        <div className="seat-name">{seat.name}</div>
        <div className="seat-title">{seat.title}</div>
        {!seat.isHuman && agent?.model && (
          <div className="seat-model">{agent.model.split('/').pop()?.replace(/-/g, ' ')}</div>
        )}
      </div>
    </div>
  );
}

export default function Boardroom({ agents, onDrill }: BoardroomProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const agentMap = new Map(agents.map(a => [a.agentId, a]));
  const activeCount = agents.filter(a => a.status === 'active' || a.status === 'busy').length;

  return (
    <div className="boardroom">
      <div className="boardroom-header">
        <div className="boardroom-stats">
          <div className="br-stat">
            <span className="br-stat-value">{agents.length + 1}</span>
            <span className="br-stat-label">In Session</span>
          </div>
          <div className="br-stat">
            <span className="br-stat-value br-stat-active">{activeCount}</span>
            <span className="br-stat-label">Active</span>
          </div>
          <div className="br-stat">
            <span className="br-stat-value">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="br-stat-label">Local Time</span>
          </div>
        </div>
      </div>

      <div className="boardroom-arena">
        {/* The table */}
        <div className="boardroom-table">
          <div className="table-surface">
            <div className="table-logo">⬡ NetSmith</div>
          </div>
        </div>

        {/* Seats */}
        {SEATS.map(seat => (
          <SeatCard
            key={seat.agentId}
            seat={seat}
            agent={agentMap.get(seat.agentId)}
            onDrill={onDrill}
          />
        ))}
      </div>

      <div className="boardroom-legend">
        <span className="legend-item"><span className="dot-active legend-dot" /> Active</span>
        <span className="legend-item"><span className="dot-idle legend-dot" /> Idle</span>
        <span className="legend-hint">Click an agent to open DrillView</span>
      </div>
    </div>
  );
}
