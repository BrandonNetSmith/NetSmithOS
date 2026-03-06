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
  side: 'head' | 'foot' | 'left' | 'right';
  sideIndex?: number; // 0=top, 1=mid, 2=bottom for left/right
  isHuman?: boolean;
}

const SEATS: SeatConfig[] = [
  { agentId: 'brandon', name: 'Brandon', title: 'CEO', side: 'head', isHuman: true },
  { agentId: 'main',    name: 'Tim',     title: 'COO', side: 'left',  sideIndex: 0 },
  { agentId: 'gary',    name: 'Gary',    title: 'CMO', side: 'left',  sideIndex: 1 },
  { agentId: 'steve',   name: 'Steve',   title: 'CPO', side: 'left',  sideIndex: 2 },
  { agentId: 'elon',    name: 'Elon',    title: 'CTO', side: 'right', sideIndex: 0 },
  { agentId: 'warren',  name: 'Warren',  title: 'CRO', side: 'right', sideIndex: 1 },
  { agentId: 'noah',    name: 'Noah',    title: 'SMM', side: 'right', sideIndex: 2 },
];

function SeatCard({
  seat, agent, onDrill,
}: { seat: SeatConfig; agent: Agent | undefined; onDrill: (id: string) => void }) {
  const status = seat.isHuman ? 'active' : (agent?.status || 'idle');
  const isActive = status === 'active' || status === 'busy';
  const emoji = agent?.emoji;

  const sideClass = seat.side === 'left' || seat.side === 'right'
    ? `boardroom-seat-${seat.side}-${seat.sideIndex}`
    : `boardroom-seat-${seat.side}`;

  return (
    <div
      className={`boardroom-seat ${sideClass} ${isActive ? 'seat-active' : 'seat-idle'} ${seat.side === 'left' ? 'seat-faces-right' : seat.side === 'right' ? 'seat-faces-left' : ''}`}
      onClick={() => !seat.isHuman && onDrill(seat.agentId)}
      title={seat.isHuman ? seat.name : `Open ${seat.name}'s DrillView`}
    >
      <div className="seat-chair" />
      <div className="seat-card-inner">
        <div className="seat-avatar-wrap">
          {seat.isHuman ? (
            <span className="seat-human-avatar">👤</span>
          ) : (
            <AgentAvatar agentId={seat.agentId} emoji={emoji} size={44} />
          )}
          <span className={`seat-status-dot ${isActive ? 'dot-active' : 'dot-idle'}`} />
        </div>
        <div className="seat-info">
          <div className="seat-name">{seat.name}</div>
          <div className="seat-title">{seat.title}</div>
        </div>
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
        <div className="boardroom-title">Executive Boardroom</div>
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

      <div className="boardroom-room">
        {/* Room back wall */}
        <div className="room-wall" />
        <div className="room-floor" />

        {/* Window panels on back wall */}
        <div className="room-window room-window-left" />
        <div className="room-window room-window-right" />

        {/* Arena with table */}
        <div className="boardroom-arena">
          {/* The wooden table */}
          <div className="boardroom-table">
            <div className="table-wood">
              <div className="table-grain" />
              <div className="table-reflection" />
              <div className="table-items">
                <div className="table-nameplate">⬡ NetSmith OS</div>
                <div className="table-glasses">
                  <span className="table-glass" />
                  <span className="table-glass" />
                  <span className="table-glass" />
                </div>
              </div>
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
      </div>

      <div className="boardroom-legend">
        <span className="legend-item"><span className="dot-active legend-dot" /> Active</span>
        <span className="legend-item"><span className="dot-idle legend-dot" /> Idle</span>
        <span className="legend-hint">Click an agent to open DrillView</span>
      </div>
    </div>
  );
}
