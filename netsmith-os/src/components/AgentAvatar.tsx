import { useState } from 'react';
import type { Agent } from '../api/types';

const AVATAR_MAP: Record<string, string> = {
  main: '/avatars/tim.jpg',
  elon: '/avatars/elon.jpg',
  gary: '/avatars/gary.jpg',
  warren: '/avatars/warren.jpg',
  steve: '/avatars/steve.jpg',
  noah: '/avatars/noah.jpg',
  clay: '/avatars/clay.jpg',
  calvin: '/avatars/calvin.jpg',
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
  const [imageFailed, setImageFailed] = useState(false);
  const src = AVATAR_MAP[agentId];
  const fallbackEmoji = emoji || FALLBACK_EMOJI[agentId] || '⬡';

  if (src && !imageFailed) {
    return (
      <img
        src={src}
        alt={agentId}
        width={size}
        height={size}
        className={`agent-avatar ${className}`}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={() => setImageFailed(true)}
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
