import { useState, useEffect, useRef, useCallback } from 'react';
import { ChannelSidebar } from './ChannelSidebar';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { api } from '../api/client';
import type { Agent, Channel, ChannelMessage } from '../api/types';
import './chat.css';

interface ChatLayoutProps {
  agents: Agent[];
  isOpen: boolean;
  onClose: () => void;
}

export function ChatLayout({ agents, isOpen, onClose }: ChatLayoutProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('general');
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const seenMsgIds = useRef<Set<string>>(new Set());

  // Fetch channels
  const fetchChannels = useCallback(async () => {
    try {
      const data = await api.getChannels();
      setChannels(data.channels);
    } catch (err) {
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchChannels();
    }
  }, [isOpen, fetchChannels]);

  // Fetch messages for active channel
  const fetchMessages = useCallback(async (channelId: string, before?: number) => {
    setLoading(true);
    try {
      const data = await api.getChannelMessages(channelId, 50, before);
      if (before) {
        // Prepend older messages
        setMessages(prev => {
          const newMsgs = data.messages.filter((m: ChannelMessage) => !seenMsgIds.current.has(m.id));
          newMsgs.forEach((m: ChannelMessage) => seenMsgIds.current.add(m.id));
          return [...newMsgs, ...prev];
        });
      } else {
        seenMsgIds.current = new Set(data.messages.map((m: ChannelMessage) => m.id));
        setMessages(data.messages);
      }
      setHasMore(data.hasMore);
    } catch (err) {
    } finally {
      setLoading(false);
    }
  }, []);

  // Switch channel
  const handleSelectChannel = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
    setMessages([]);
    seenMsgIds.current = new Set();
    fetchMessages(channelId);
  }, [fetchMessages]);

  // Load initial messages
  useEffect(() => {
    if (isOpen && activeChannelId) {
      fetchMessages(activeChannelId);
    }
  }, [isOpen, activeChannelId, fetchMessages]);

  // SSE connection for active channel
  useEffect(() => {
    if (!isOpen || !activeChannelId) return;

    // Close existing
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    const es = new EventSource(`/api/channels/${activeChannelId}/stream`);
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message' && data.message) {
          const msg = data.message as ChannelMessage;
          if (!seenMsgIds.current.has(msg.id)) {
            seenMsgIds.current.add(msg.id);
            setMessages(prev => [...prev, msg]);
          }
          // Refresh channel list for last_message update
          fetchChannels();
        }
      } catch {}
    };

    es.onerror = () => {
      // Will auto-reconnect
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [isOpen, activeChannelId, fetchChannels]);

  // Send message
  const handleSend = useCallback(async (content: string) => {
    if (!activeChannelId || !content.trim() || sending) return;
    setSending(true);
    try {
      await api.sendChannelMessage(activeChannelId, content.trim());
      // Messages will arrive via SSE, no need to manually add
    } catch (err) {
    } finally {
      setSending(false);
    }
  }, [activeChannelId, sending]);

  // Load more (older messages)
  const handleLoadMore = useCallback(() => {
    if (messages.length > 0 && activeChannelId) {
      fetchMessages(activeChannelId, messages[0].created_at);
    }
  }, [messages, activeChannelId, fetchMessages]);

  // Get active channel participants
  const activeChannel = channels.find(c => c.id === activeChannelId);
  const participants = activeChannel?.participants || [];

  if (!isOpen) return null;

  return (
    <div className="chat-layout-overlay">
      <div className="chat-layout">
        <div className="chat-layout-header">
          <div className="chat-layout-title">
            <span className="chat-layout-icon">&#x1F4AC;</span>
            <span>Channels</span>
            {activeChannel && (
              <span className="chat-layout-active-name">
                &mdash; {activeChannel.name}
              </span>
            )}
          </div>
          <button className="chat-layout-close" onClick={onClose}>&times;</button>
        </div>
        <div className="chat-layout-body">
          <ChannelSidebar
            channels={channels}
            activeChannelId={activeChannelId}
            onSelectChannel={handleSelectChannel}
            agents={agents}
          />
          <div className="chat-layout-main">
            <MessageList
              messages={messages}
              loading={loading}
              onLoadMore={handleLoadMore}
              hasMore={hasMore}
              agents={agents}
            />
            <MessageInput
              onSend={handleSend}
              disabled={sending}
              placeholder={
                sending
                  ? 'Waiting for response...'
                  : activeChannel
                    ? `Message ${activeChannel.name}...`
                    : 'Select a channel...'
              }
              participants={participants}
              agents={agents}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
