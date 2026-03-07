import type { Channel, Agent } from '../api/types';

const AGENT_EMOJI: Record<string, string> = {
  main: '\u{1F9E0}', elon: '\u{1F528}', gary: '\u{1F4E2}', warren: '\u{1F4B0}',
  steve: '\u{1F3AF}', noah: '\u{1F4F1}', clay: '\u{1F99E}', calvin: '\u{1F99E}',
};

interface ChannelSidebarProps {
  channels: Channel[];
  activeChannelId: string;
  onSelectChannel: (id: string) => void;
  agents: Agent[];
}

function formatTime(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ChannelSidebar({ channels, activeChannelId, onSelectChannel, agents }: ChannelSidebarProps) {
  const groupChannels = channels.filter(c => c.type === 'group');
  const directChannels = channels.filter(c => c.type === 'direct');

  const getAgentEmoji = (channelId: string): string => {
    const agentId = channelId.replace('dm-', '');
    const agent = agents.find(a => a.agentId === agentId);
    return agent?.emoji || AGENT_EMOJI[agentId] || '\u2B21';
  };

  return (
    <div className="channel-sidebar">
      <div className="channel-section">
        <div className="channel-section-title">Channels</div>
        {groupChannels.map(ch => (
          <button
            key={ch.id}
            className={`channel-item ${ch.id === activeChannelId ? 'channel-item-active' : ''}`}
            onClick={() => onSelectChannel(ch.id)}
          >
            <span className="channel-hash">#</span>
            <span className="channel-name">{ch.name.replace(/^#/, '')}</span>
            <span className="channel-time">{formatTime(ch.last_message_at)}</span>
          </button>
        ))}
      </div>

      <div className="channel-section">
        <div className="channel-section-title">Direct Messages</div>
        {directChannels.map(ch => (
          <button
            key={ch.id}
            className={`channel-item ${ch.id === activeChannelId ? 'channel-item-active' : ''}`}
            onClick={() => onSelectChannel(ch.id)}
          >
            <span className="channel-dm-emoji">{getAgentEmoji(ch.id)}</span>
            <span className="channel-name">{ch.name}</span>
            <span className="channel-time">{formatTime(ch.last_message_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
