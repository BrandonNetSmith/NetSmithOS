import { useState, useEffect, useRef, useCallback } from 'react';
import type { Agent, ChannelMessage, MeetingEvent } from '../api/types';
import { api } from '../api/client';
import { AgentAvatar } from '../components/AgentAvatar';
import '../styles/meeting.css';

interface MeetingViewProps {
  meetingId: string;
  topic: string;
  participants: string[];
  agents: Agent[];
  onClose: () => void;
}

export function MeetingView({ meetingId, topic, participants, agents, onClose }: MeetingViewProps) {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [meetingState, setMeetingState] = useState<'active' | 'complete'>('active');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const agentMap = new Map(agents.map(a => [a.agentId, a]));

  // Connect to SSE stream
  useEffect(() => {
    const es = new EventSource(`/api/meetings/${meetingId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (evt) => {
      try {
        const event: MeetingEvent = JSON.parse(evt.data);

        switch (event.type) {
          case 'connected':
            if (event.currentSpeaker) setCurrentSpeaker(event.currentSpeaker);
            if (event.round) setRound(event.round);
            break;
          case 'message':
            if (event.message) {
              setMessages(prev => {
                // Dedupe
                if (prev.some(m => m.id === event.message!.id)) return prev;
                return [...prev, event.message!];
              });
            }
            break;
          case 'speaking':
            setCurrentSpeaker(event.agentId || null);
            break;
          case 'round':
            setRound(event.round || 1);
            break;
          case 'complete':
            setMeetingState('complete');
            setCurrentSpeaker(null);
            if (event.summary) setSummary(event.summary);
            if (event.message) {
              setMessages(prev => [...prev, event.message!]);
            }
            break;
        }
      } catch {}
    };

    es.onerror = () => {
      // SSE will auto-reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [meetingId]);

  // Load existing messages
  useEffect(() => {
    api.getMeeting(meetingId).then(data => {
      if (data.messages) setMessages(data.messages);
      if (data.state === 'complete') setMeetingState('complete');
      if (data.currentSpeaker) setCurrentSpeaker(data.currentSpeaker);
      if (data.round) setRound(data.round);
    }).catch(() => {});
  }, [meetingId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending || meetingState !== 'active') return;
    setSending(true);
    try {
      await api.sendMeetingMessage(meetingId, input.trim());
      setInput('');
    } catch (err) {
    }
    setSending(false);
  }, [input, sending, meetingId, meetingState]);

  const handleEnd = useCallback(async () => {
    try {
      await api.endMeeting(meetingId);
    } catch (err) {
    }
  }, [meetingId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  function getSenderInfo(msg: ChannelMessage) {
    if (msg.sender_id === 'human') return { name: 'Brandon', emoji: '👤', isHuman: true };
    if (msg.sender_id === 'system') return { name: msg.sender_name, emoji: '⚙️', isSystem: true };
    const agent = agentMap.get(msg.sender_id);
    return { name: agent?.name || msg.sender_name, emoji: agent?.emoji, agentId: msg.sender_id };
  }

  return (
    <div className="meeting-overlay">
      <div className="meeting-container">
        {/* Header */}
        <div className="meeting-header">
          <div className="meeting-header-left">
            <div className="meeting-topic">{topic}</div>
            <div className="meeting-meta">
              {meetingState === 'active' ? (
                <>
                  <span className="meeting-round">Round {round}/3</span>
                  <span className="meeting-status-dot active" />
                  <span>Live</span>
                </>
              ) : (
                <>
                  <span className="meeting-status-dot complete" />
                  <span>Complete</span>
                </>
              )}
            </div>
          </div>
          <div className="meeting-header-right">
            {meetingState === 'active' && (
              <button className="meeting-btn meeting-btn-end" onClick={handleEnd}>End Meeting</button>
            )}
            <button className="meeting-btn meeting-btn-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Participants bar */}
        <div className="meeting-participants">
          <div className="meeting-participant human-participant">
            <span className="participant-avatar">👤</span>
            <span className="participant-name">Brandon</span>
          </div>
          {participants.map(pid => {
            const agent = agentMap.get(pid);
            const isSpeaking = currentSpeaker === pid;
            return (
              <div key={pid} className={`meeting-participant ${isSpeaking ? 'speaking' : ''}`}>
                <div className="participant-avatar-wrap">
                  <AgentAvatar agentId={pid} emoji={agent?.emoji} size={32} />
                  {isSpeaking && <span className="speaking-indicator" />}
                </div>
                <span className="participant-name">{agent?.name || pid}</span>
              </div>
            );
          })}
        </div>

        {/* Messages */}
        <div className="meeting-messages">
          {messages.map(msg => {
            const sender = getSenderInfo(msg);
            return (
              <div key={msg.id} className={`meeting-msg ${sender.isSystem ? 'msg-system' : ''} ${sender.isHuman ? 'msg-human' : ''}`}>
                <div className="msg-avatar">
                  {sender.isHuman ? (
                    <span className="msg-avatar-emoji">👤</span>
                  ) : sender.isSystem ? (
                    <span className="msg-avatar-emoji">⚙️</span>
                  ) : (
                    <AgentAvatar agentId={sender.agentId!} emoji={sender.emoji} size={36} />
                  )}
                </div>
                <div className="msg-body">
                  <div className="msg-header">
                    <span className="msg-sender">{sender.name}</span>
                    <span className="msg-time">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="msg-content">{msg.content}</div>
                </div>
              </div>
            );
          })}

          {currentSpeaker && meetingState === 'active' && (
            <div className="meeting-msg msg-typing">
              <div className="msg-avatar">
                <AgentAvatar agentId={currentSpeaker} emoji={agentMap.get(currentSpeaker)?.emoji} size={36} />
              </div>
              <div className="msg-body">
                <div className="msg-header">
                  <span className="msg-sender">{agentMap.get(currentSpeaker)?.name || currentSpeaker}</span>
                </div>
                <div className="msg-content typing-dots">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        {meetingState === 'active' && (
          <div className="meeting-input-area">
            <textarea
              className="meeting-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Interject in the meeting... (Enter to send)"
              rows={2}
              disabled={sending}
            />
            <button
              className="meeting-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || sending}
            >
              Send
            </button>
          </div>
        )}

        {/* Summary */}
        {meetingState === 'complete' && summary && (
          <div className="meeting-summary-bar">
            <div className="summary-label">📋 Meeting concluded — summary above</div>
            <button className="meeting-btn meeting-btn-close" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Meeting Setup Modal ──────────────────────────────────────────────────

interface MeetingSetupProps {
  agents: Agent[];
  onStart: (topic: string, participants: string[]) => void;
  onCancel: () => void;
  defaultParticipants?: string[];
}

export function MeetingSetupModal({ agents, onStart, onCancel, defaultParticipants }: MeetingSetupProps) {
  const [topic, setTopic] = useState('');
  const [selected, setSelected] = useState<Set<string>>(
    new Set(defaultParticipants || agents.filter(a => a.agentId !== 'clay' && a.agentId !== 'calvin').map(a => a.agentId))
  );

  const toggleAgent = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStart = () => {
    if (!topic.trim() || selected.size === 0) return;
    onStart(topic.trim(), Array.from(selected));
  };

  return (
    <div className="meeting-setup-overlay" onClick={onCancel}>
      <div className="meeting-setup-modal" onClick={e => e.stopPropagation()}>
        <div className="setup-header">
          <h2>Call Meeting</h2>
          <button className="setup-close" onClick={onCancel}>✕</button>
        </div>

        <div className="setup-field">
          <label>Topic / Agenda</label>
          <textarea
            className="setup-topic-input"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="What should we discuss?"
            rows={3}
            autoFocus
          />
        </div>

        <div className="setup-field">
          <label>Participants</label>
          <div className="setup-agents-grid">
            {agents.filter(a => a.agentId !== 'clay' && a.agentId !== 'calvin').map(a => (
              <div
                key={a.agentId}
                className={`setup-agent-card ${selected.has(a.agentId) ? 'selected' : ''}`}
                onClick={() => toggleAgent(a.agentId)}
              >
                <AgentAvatar agentId={a.agentId} emoji={a.emoji} size={36} />
                <div className="setup-agent-info">
                  <div className="setup-agent-name">{a.name}</div>
                  <div className="setup-agent-role">{a.role}</div>
                </div>
                <div className={`setup-check ${selected.has(a.agentId) ? 'checked' : ''}`}>
                  {selected.has(a.agentId) ? '✓' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="setup-actions">
          <button className="meeting-btn" onClick={onCancel}>Cancel</button>
          <button
            className="meeting-btn meeting-btn-start"
            onClick={handleStart}
            disabled={!topic.trim() || selected.size === 0}
          >
            Start Meeting ({selected.size} participants)
          </button>
        </div>
      </div>
    </div>
  );
}
