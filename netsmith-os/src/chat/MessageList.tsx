import { useEffect, useRef } from 'react';
import { AgentAvatar } from '../components/AgentAvatar';
import type { ChannelMessage, Agent } from '../api/types';

interface MessageListProps {
  messages: ChannelMessage[];
  loading: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
  agents: Agent[];
}

const AGENT_META: Record<string, { name: string; role: string; emoji: string }> = {
  main: { name: 'Tim', role: 'COO', emoji: '\u{1F9E0}' },
  elon: { name: 'Elon', role: 'CTO', emoji: '\u26A1' },
  gary: { name: 'Gary', role: 'CMO', emoji: '\u{1F4E2}' },
  warren: { name: 'Warren', role: 'CRO', emoji: '\u{1F4B0}' },
  steve: { name: 'Steve', role: 'CPO', emoji: '\u{1F3AF}' },
  noah: { name: 'Noah', role: 'SMM', emoji: '\u{1F4F1}' },
  clay: { name: 'Clay', role: 'Ops', emoji: '\u{1F99E}' },
  calvin: { name: 'Calvin', role: 'Ops', emoji: '\u{1F99E}' },
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDateDivider(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function shouldShowDateDivider(messages: ChannelMessage[], index: number): boolean {
  if (index === 0) return true;
  const prev = new Date(messages[index - 1].created_at).toDateString();
  const curr = new Date(messages[index].created_at).toDateString();
  return prev !== curr;
}

export function MessageList({ messages, loading, onLoadMore, hasMore, agents: _agents }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);

  // Track if user is at bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const threshold = 60;
      wasAtBottom.current = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll to bottom on new messages if user was at bottom
  useEffect(() => {
    if (wasAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Initial scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, []);

  const isHuman = (senderId: string) => senderId === 'human';
  const isSystem = (senderId: string) => senderId === 'system';

  return (
    <div className="message-list" ref={containerRef}>
      {hasMore && (
        <div className="message-load-more">
          <button onClick={onLoadMore} disabled={loading} className="load-more-btn">
            {loading ? 'Loading...' : 'Load earlier messages'}
          </button>
        </div>
      )}

      {messages.length === 0 && !loading && (
        <div className="message-empty">
          <div className="message-empty-icon">&#x1F4AC;</div>
          <p>No messages yet</p>
          <p className="message-empty-hint">Send a message to start the conversation.</p>
        </div>
      )}

      {messages.map((msg, i) => (
        <div key={msg.id}>
          {shouldShowDateDivider(messages, i) && (
            <div className="message-date-divider">
              <span>{formatDateDivider(msg.created_at)}</span>
            </div>
          )}
          <div className={`message-row ${isHuman(msg.sender_id) ? 'message-row-human' : ''} ${isSystem(msg.sender_id) ? 'message-row-system' : ''}`}>
            {!isHuman(msg.sender_id) && !isSystem(msg.sender_id) && (
              <div className="message-avatar">
                <AgentAvatar
                  agentId={msg.sender_id}
                  emoji={AGENT_META[msg.sender_id]?.emoji}
                  size={32}
                />
              </div>
            )}
            <div className={`message-bubble ${isHuman(msg.sender_id) ? 'message-bubble-human' : ''} ${isSystem(msg.sender_id) ? 'message-bubble-system' : ''}`}>
              {!isHuman(msg.sender_id) && !isSystem(msg.sender_id) && (
                <div className="message-sender">
                  <span className="message-sender-name">{msg.sender_name}</span>
                  {AGENT_META[msg.sender_id] && (
                    <span className="message-sender-role">{AGENT_META[msg.sender_id].role}</span>
                  )}
                </div>
              )}
              {isSystem(msg.sender_id) && (
                <div className="message-sender">
                  <span className="message-sender-name message-system-label">System</span>
                </div>
              )}
              <div className="message-content">{msg.content}</div>
              <div className="message-time">{formatTimestamp(msg.created_at)}</div>
            </div>
          </div>
        </div>
      ))}

      {loading && messages.length === 0 && (
        <div className="message-loading">Loading messages...</div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
