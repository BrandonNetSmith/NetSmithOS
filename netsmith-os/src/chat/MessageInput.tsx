import { useState, useRef, useEffect, useCallback } from 'react';
import type { Agent } from '../api/types';

const AGENT_META: Record<string, { name: string; emoji: string }> = {
  main: { name: 'Tim', emoji: '\u{1F9E0}' },
  elon: { name: 'Elon', emoji: '\u26A1' },
  gary: { name: 'Gary', emoji: '\u{1F4E2}' },
  warren: { name: 'Warren', emoji: '\u{1F4B0}' },
  steve: { name: 'Steve', emoji: '\u{1F3AF}' },
  noah: { name: 'Noah', emoji: '\u{1F4F1}' },
  clay: { name: 'Clay', emoji: '\u{1F99E}' },
  calvin: { name: 'Calvin', emoji: '\u{1F99E}' },
};

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
  placeholder: string;
  participants: string[];
  agents: Agent[];
}

interface MentionSuggestion {
  id: string;
  name: string;
  emoji: string;
}

export function MessageInput({ onSend, disabled, placeholder, participants, agents }: MessageInputProps) {
  const [value, setValue] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Build mention suggestions from participants
  const mentionSuggestions: MentionSuggestion[] = participants
    .filter(p => p !== 'human')
    .map(p => {
      const agent = agents.find(a => a.agentId === p);
      const meta = AGENT_META[p];
      return {
        id: p,
        name: agent?.name || meta?.name || p,
        emoji: agent?.emoji || meta?.emoji || '\u2B21',
      };
    })
    .filter(s => !mentionFilter || s.name.toLowerCase().includes(mentionFilter.toLowerCase()) || s.id.includes(mentionFilter.toLowerCase()));

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Check for @mention trigger
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1]);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
      setMentionFilter('');
    }
  };

  const insertMention = useCallback((suggestion: MentionSuggestion) => {
    const el = inputRef.current;
    if (!el) return;

    const cursorPos = el.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex >= 0) {
      const newValue = textBeforeCursor.slice(0, atIndex) + `@${suggestion.name} ` + textAfterCursor;
      setValue(newValue);
      setShowMentions(false);
      setMentionFilter('');

      // Restore focus
      setTimeout(() => {
        el.focus();
        const newPos = atIndex + suggestion.name.length + 2;
        el.setSelectionRange(newPos, newPos);
      }, 10);
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSend(value);
        setValue('');
        setShowMentions(false);
        // Reset height
        if (inputRef.current) inputRef.current.style.height = 'auto';
      }
    }
  };

  return (
    <div className="message-input-container">
      {showMentions && mentionSuggestions.length > 0 && (
        <div className="mention-dropdown">
          {mentionSuggestions.map((s, i) => (
            <button
              key={s.id}
              className={`mention-item ${i === mentionIndex ? 'mention-item-active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); insertMention(s); }}
              onMouseEnter={() => setMentionIndex(i)}
            >
              <span className="mention-emoji">{s.emoji}</span>
              <span className="mention-name">{s.name}</span>
              <span className="mention-id">@{s.id}</span>
            </button>
          ))}
        </div>
      )}
      <div className="message-input-row">
        <textarea
          ref={inputRef}
          className="message-input"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />
        <button
          className="message-send-btn"
          onClick={() => {
            if (value.trim() && !disabled) {
              onSend(value);
              setValue('');
              setShowMentions(false);
              if (inputRef.current) inputRef.current.style.height = 'auto';
            }
          }}
          disabled={disabled || !value.trim()}
        >
          {disabled ? (
            <span className="send-spinner" />
          ) : (
            <span>&#x27A4;</span>
          )}
        </button>
      </div>
    </div>
  );
}
