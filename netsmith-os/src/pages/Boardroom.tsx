import { useState, useEffect, useRef, useCallback } from 'react';
import { MeetingSetupModal } from '../meetings/MeetingView';
import { AgentAvatar } from '../components/AgentAvatar';
import { api } from '../api/client';
import type { Agent, ChannelMessage, MeetingEvent } from '../api/types';
import '../styles/boardroom.css';

type BoardroomState = 'idle' | 'setup' | 'active' | 'review';

interface SeatConfig {
  agentId: string;
  name: string;
  title: string;
  side: 'head' | 'left' | 'right';
  sideIndex?: number;
  isHuman?: boolean;
}

const SEATS: SeatConfig[] = [
  { agentId: 'brandon', name: 'Brandon', title: 'CEO', side: 'head', isHuman: true },
  { agentId: 'main',    name: 'Tim',     title: 'COO', side: 'left',  sideIndex: 0 },
  { agentId: 'elon',    name: 'Elon',    title: 'CTO', side: 'left',  sideIndex: 1 },
  { agentId: 'warren',  name: 'Warren',  title: 'CRO', side: 'left',  sideIndex: 2 },
  { agentId: 'steve',   name: 'Steve',   title: 'CPO', side: 'right', sideIndex: 0 },
  { agentId: 'gary',    name: 'Gary',    title: 'CMO', side: 'right', sideIndex: 1 },
  { agentId: 'noah',    name: 'Noah',    title: 'SMM', side: 'right', sideIndex: 2 },
];

interface SeatCardProps {
  seat: SeatConfig;
  agent?: Agent;
  isSpeaking?: boolean;
  speechSnippet?: string;
  isTyping?: boolean;
  meetingActive?: boolean;
  onClick?: () => void;
}

function SeatCard({ seat, agent, isSpeaking, speechSnippet, isTyping, meetingActive, onClick }: SeatCardProps) {
  const status = agent?.status || (seat.isHuman ? 'active' : 'idle');
  const sideClass = seat.side === 'head' ? 'seat-head' : seat.side === 'left' ? `seat-left seat-left-${seat.sideIndex}` : `seat-right seat-right-${seat.sideIndex}`;
  const bubbleSide = seat.side === 'left' ? 'bubble-right' : seat.side === 'right' ? 'bubble-left' : 'bubble-above';

  return (
    <div className={`boardroom-seat ${sideClass} ${isSpeaking ? 'seat-speaking' : ''}`}>
      {/* Speech bubble */}
      {meetingActive && (isSpeaking || speechSnippet) && (
        <div className={`speech-bubble ${bubbleSide}`}>
          {isTyping ? (
            <div className="typing-dots"><span /><span /><span /></div>
          ) : (
            <span className="speech-text">{speechSnippet}</span>
          )}
        </div>
      )}

      <div className="seat-card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
        {/* Chair back */}
        <div className={`seat-chair seat-chair-${seat.side}`} />
        <div className="seat-card-inner">
          {seat.isHuman ? (
            <div className="seat-human-avatar">👤</div>
          ) : (
            <AgentAvatar agentId={seat.agentId} size={40} />
          )}
          <div className="seat-info">
            <div className="seat-name">{seat.name}</div>
            <div className="seat-title">{seat.title}</div>
          </div>
          <div className={`seat-dot dot-${status}`} />
        </div>
      </div>
    </div>
  );
}

// Meeting summary is stored as a plain markdown string

export function Boardroom({ agents, onDrill }: { agents: Agent[]; onDrill: (id: string) => void }) {
  const [state, setState] = useState<BoardroomState>('idle');
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [summaryData, setSummaryData] = useState<string | null>(null);
  const [meetingTopic, setMeetingTopic] = useState('');
  const [humanInput, setHumanInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Get last speech snippet per agent (for bubble display)
  const getLastSnippet = useCallback((agentId: string): string => {
    const agentMsgs = messages.filter(m => m.sender_id === agentId);
    if (agentMsgs.length === 0) return '';
    const last = agentMsgs[agentMsgs.length - 1].content;
    return last.length > 80 ? last.slice(0, 77) + '...' : last;
  }, [messages]);

  // SSE connection for active meetings
  useEffect(() => {
    if (!meetingId || state !== 'active') return;

    const es = new EventSource(`/api/meetings/${meetingId}/stream`);
    eventSourceRef.current = es;
    const seenIds = new Set<string>();

    es.onmessage = (evt) => {
      try {
        const event: MeetingEvent = JSON.parse(evt.data);
        switch (event.type) {
          case 'connected':
            if (event.currentSpeaker) setCurrentSpeaker(event.currentSpeaker);
            if (event.round) setCurrentRound(event.round);
            break;
          case 'message':
            if (event.message && !seenIds.has(event.message.id)) {
              seenIds.add(event.message.id);
              setMessages(prev => [...prev, event.message!]);
              setCurrentSpeaker(null);
            }
            break;
          case 'speaking':
            if (event.agentId) setCurrentSpeaker(event.agentId);
            break;
          case 'round':
            if (event.round) setCurrentRound(event.round);
            break;
          case 'complete':
            setState('review');
            setCurrentSpeaker(null);
            if (event.summary) {
              setSummaryData(typeof event.summary === 'string' ? event.summary : String(event.summary));
            }
            break;
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => { /* SSE reconnects automatically */ };

    // Load existing messages
    api.getMeeting(meetingId).then(data => {
      if (data?.messages) {
        const existing = data.messages as ChannelMessage[];
        existing.forEach(m => seenIds.add(m.id));
        setMessages(existing);
      }
    }).catch(() => {});

    return () => { es.close(); eventSourceRef.current = null; };
  }, [meetingId, state]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStartMeeting = async (topic: string, participants: string[]) => {
    setState('active');
    setMeetingTopic(topic);
    setMessages([]);
    setCurrentSpeaker(null);
    setCurrentRound(0);
    setSummaryData(null);
    try {
      const result = await api.createMeeting(topic, participants);
      setMeetingId(result.id);
    } catch (err) {
      console.error('Failed to create meeting:', err);
      setState('idle');
    }
  };

  const handleSendMessage = async () => {
    if (!humanInput.trim() || !meetingId || sending) return;
    setSending(true);
    try {
      await api.sendMeetingMessage(meetingId, humanInput.trim());
      setHumanInput('');
    } catch { /* silent */ }
    setSending(false);
  };

  const handleEndMeeting = async () => {
    if (!meetingId) return;
    try { await api.endMeeting(meetingId); } catch { /* silent */ }
  };

  const handleNewMeeting = () => {
    setState('idle');
    setMeetingId(null);
    setMessages([]);
    setSummaryData(null);
    setMeetingTopic('');
  };

  const getAgentName = (senderId: string): string => {
    if (senderId === 'human') return 'Brandon';
    const seat = SEATS.find(s => s.agentId === senderId);
    return seat?.name || senderId;
  };

  const getAgentTitle = (senderId: string): string => {
    if (senderId === 'human') return 'CEO';
    const seat = SEATS.find(s => s.agentId === senderId);
    return seat?.title || '';
  };

  return (
    <div className="boardroom">
      <div className="boardroom-header">
        <h2>🏛 The Boardroom</h2>
        <div className="boardroom-header-right">
          {state === 'active' && meetingTopic && (
            <span className="meeting-topic-badge">📋 {meetingTopic}</span>
          )}
          {state === 'active' && currentRound > 0 && (
            <span className="meeting-round-badge">Round {currentRound}/3</span>
          )}
        </div>
      </div>

      <div className={`boardroom-body ${state === 'active' || state === 'review' ? 'has-panel' : ''}`}>
        {/* Main boardroom scene */}
        <div className="boardroom-room">
          <div className="room-wall" />
          <div className="room-floor" />
          <div className="room-spotlight" />
          <div className="room-window room-window-left">
            <div className="window-glow" />
          </div>
          <div className="room-window room-window-right">
            <div className="window-glow" />
          </div>

          <div className="boardroom-arena">
            <div className="boardroom-table">
              <div className="table-wood" />
              <div className="table-grain" />
              <div className="table-reflection" />
            </div>

            {SEATS.map(seat => {
              const agent = agents.find(a => (a.agentId || a.id) === seat.agentId);
              const isSpeaking = state === 'active' && currentSpeaker === seat.agentId;
              const snippet = state === 'active' ? getLastSnippet(seat.agentId) : '';
              return (
                <SeatCard
                  key={seat.agentId}
                  seat={seat}
                  agent={agent}
                  isSpeaking={isSpeaking}
                  isTyping={isSpeaking}
                  speechSnippet={!isSpeaking ? snippet : undefined}
                  meetingActive={state === 'active'}
                  onClick={!seat.isHuman ? () => onDrill(seat.agentId) : undefined}
                />
              );
            })}
          </div>

          {/* Call Meeting button (idle state) */}
          {state === 'idle' && (
            <button className="boardroom-call-meeting" onClick={() => setState('setup')}>
              <span className="call-icon">📞</span> Call Meeting
            </button>
          )}
        </div>

        {/* Meeting sidebar panel */}
        {(state === 'active' || state === 'review') && (
          <div className="meeting-panel">
            <div className="meeting-panel-header">
              <h3>{state === 'review' ? '📋 Meeting Summary' : '💬 Meeting Chat'}</h3>
              {state === 'active' && (
                <button className="meeting-end-btn" onClick={handleEndMeeting}>End Meeting</button>
              )}
              {state === 'review' && (
                <button className="meeting-end-btn" onClick={handleNewMeeting}>Close</button>
              )}
            </div>

            {state === 'review' && summaryData ? (
              <div className="meeting-panel-review">
                <div className="review-summary">
                  <div className="review-summary-text">{summaryData}</div>
                </div>
                <button className="meeting-new-btn" onClick={handleNewMeeting}>
                  New Meeting
                </button>
              </div>
            ) : (
              <>
                <div className="meeting-panel-messages">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`panel-msg ${msg.sender_id === 'human' ? 'panel-msg-human' : ''}`}>
                      <div className="panel-msg-header">
                        <span className="panel-msg-sender">{getAgentName(msg.sender_id)}</span>
                        <span className="panel-msg-role">{getAgentTitle(msg.sender_id)}</span>
                      </div>
                      <div className="panel-msg-content">{msg.content}</div>
                    </div>
                  ))}
                  {currentSpeaker && (
                    <div className="panel-msg panel-msg-typing">
                      <div className="panel-msg-header">
                        <span className="panel-msg-sender">{getAgentName(currentSpeaker)}</span>
                        <span className="panel-msg-role">{getAgentTitle(currentSpeaker)}</span>
                      </div>
                      <div className="typing-dots"><span /><span /><span /></div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="meeting-panel-input">
                  <input
                    type="text"
                    value={humanInput}
                    onChange={e => setHumanInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Interject in the meeting..."
                    disabled={sending}
                  />
                  <button onClick={handleSendMessage} disabled={sending || !humanInput.trim()}>
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Meeting Setup Modal */}
      {state === 'setup' && (
        <MeetingSetupModal
          agents={agents}
          onStart={handleStartMeeting}
          onCancel={() => setState('idle')}
        />
      )}
    </div>
  );
}
