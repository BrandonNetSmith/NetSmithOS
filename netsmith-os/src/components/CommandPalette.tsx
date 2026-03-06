import { useState, useEffect, useRef, useCallback } from 'react';
import type { AppMode, Agent } from '../api/types';

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (mode: AppMode) => void;
  onDrill: (agentId: string) => void;
  onForge: () => void;
  onChatToggle: () => void;
  agents: Agent[];
}

export function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onDrill,
  onForge,
  onChatToggle,
  agents,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build command list
  const commands: CommandItem[] = [
    // Navigation commands
    { id: 'nav-bridge', label: 'Bridge', description: 'Go to Bridge view', icon: '⬡', action: () => onNavigate('bridge'), keywords: ['home', 'hex', 'main'] },
    { id: 'nav-boardroom', label: 'Boardroom', description: 'Executive council overview', icon: '🏛', action: () => onNavigate('boardroom'), keywords: ['executive', 'council', 'table'] },
    { id: 'nav-health', label: 'System Health', description: 'CPU, memory, disk, services', icon: '🖥', action: () => onNavigate('health'), keywords: ['cpu', 'memory', 'disk', 'server', 'metrics'] },
    { id: 'nav-org', label: 'Org Chart', description: 'Agent hierarchy and roster', icon: '👥', action: () => onNavigate('org'), keywords: ['team', 'hierarchy', 'agents', 'roster'] },
    { id: 'nav-tasks', label: 'Task Manager', description: 'Sessions, models, fleet', icon: '⚡', action: () => onNavigate('tasks'), keywords: ['sessions', 'models', 'fleet', 'tokens'] },
    { id: 'nav-standup', label: 'Executive Standup', description: 'Start or review meetings', icon: '📋', action: () => onNavigate('standup'), keywords: ['meeting', 'standup', 'sync'] },
    { id: 'nav-workspaces', label: 'Workspaces', description: 'Agent workspace files', icon: '🗂', action: () => onNavigate('workspaces'), keywords: ['files', 'workspace', 'config'] },
    { id: 'nav-docs', label: 'Documentation', description: 'Guides and references', icon: '📖', action: () => onNavigate('docs'), keywords: ['docs', 'help', 'guide'] },
    { id: 'nav-activity', label: 'Activity Log', description: 'Cron runs and events', icon: '📜', action: () => onNavigate('activity'), keywords: ['log', 'cron', 'events', 'runs'] },
    { id: 'nav-costs', label: 'Cost Explorer', description: 'Spend analytics and breakdown', icon: '💰', action: () => onNavigate('costs'), keywords: ['spend', 'cost', 'money', 'budget', 'tokens'] },
    { id: 'nav-settings', label: 'Settings', description: 'Configuration and preferences', icon: '⚙', action: () => onNavigate('settings'), keywords: ['config', 'preferences', 'setup'] },
    // Actions
    { id: 'action-forge', label: 'Forge New Agent', description: 'Create a new agent', icon: '⚒', action: onForge, keywords: ['create', 'new', 'agent', 'spawn'] },
    { id: 'action-chat', label: 'Open Command Chat', description: 'Chat with agents', icon: '💬', action: onChatToggle, keywords: ['chat', 'message', 'talk', 'command'] },
    // Agent drill-through
    ...agents.map(agent => ({
      id: `agent-${agent.agentId}`,
      label: `${agent.name}`,
      description: `${agent.role} • ${agent.status} • Open DrillView`,
      icon: agent.emoji || '⬡',
      action: () => onDrill(agent.agentId || agent.id),
      keywords: [agent.name.toLowerCase(), agent.role.toLowerCase(), 'agent', 'drill'],
    })),
  ];

  // Filter commands based on query
  const filtered = query.trim()
    ? commands.filter(cmd => {
        const q = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(q) ||
          cmd.description.toLowerCase().includes(q) ||
          cmd.keywords?.some(k => k.includes(q))
        );
      })
    : commands;

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const executeCommand = useCallback((cmd: CommandItem) => {
    onClose();
    // Small delay to let the palette close before navigation
    requestAnimationFrame(() => cmd.action());
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) {
          executeCommand(filtered[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()}>
        <div className="cmd-palette-input-wrap">
          <span className="cmd-palette-icon">⌘</span>
          <input
            ref={inputRef}
            className="cmd-palette-input"
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Command palette search"
          />
          <kbd className="cmd-palette-kbd">ESC</kbd>
        </div>
        <div className="cmd-palette-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="cmd-palette-empty">No matching commands</div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                className={`cmd-palette-item ${i === selectedIndex ? 'selected' : ''}`}
                onClick={() => executeCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="cmd-item-icon">{cmd.icon}</span>
                <div className="cmd-item-content">
                  <span className="cmd-item-label">{cmd.label}</span>
                  <span className="cmd-item-desc">{cmd.description}</span>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="cmd-palette-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
