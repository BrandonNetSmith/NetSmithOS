import type { Agent } from '../api/types';

const AVATAR_MAP: Record<string, string> = {
  main: '/avatars/tim.svg',
  elon: '/avatars/elon.svg',
  gary: '/avatars/gary.svg',
  warren: '/avatars/warren.svg',
  steve: '/avatars/steve.svg',
  noah: '/avatars/noah.svg',
  clay: '/avatars/clay.svg',
  calvin: '/avatars/calvin.svg',
};

const FALLBACK_EMOJI: Record<string, string> = {
  main: '🧠',
  elon: '🔨',
  gary: '📣',
  warren: '💰',
  steve: '🎨',
  noah: '📱',
  clay: '🦞',
  calvin: '🦞',
};

interface AgentAvatarProps {
  agentId: string;
  emoji?: string;
  size?: number;
  className?: string;
}

export function AgentAvatar({ agentId, emoji, size = 40, className = '' }: AgentAvatarProps) {
  const src = AVATAR_MAP[agentId];
  const fallbackEmoji = emoji || FALLBACK_EMOJI[agentId] || '⬡';

  if (src) {
    return (
      <img
        src={src}
        alt={agentId}
        width={size}
        height={size}
        className={`agent-avatar ${className}`}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={(e) => {
          // Fall back to emoji if image fails
          const parent = (e.target as HTMLImageElement).parentElement;
          if (parent) {
            (e.target as HTMLImageElement).style.display = 'none';
            const span = document.createElement('span');
            span.textContent = fallbackEmoji;
            span.style.fontSize = `${size * 0.6}px`;
            parent.appendChild(span);
          }
        }}
      />
    );
  }

  return (
    <span
      className={`agent-avatar-emoji ${className}`}
      style={{ fontSize: `${size * 0.6}px`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size }}
    >
      {fallbackEmoji}
    </span>
  );
}

export function agentEmojiFromList(agentId: string, agents: Agent[]): string {
  const found = agents.find(a => a.agentId === agentId);
  return found?.emoji || FALLBACK_EMOJI[agentId] || '⬡';
}
