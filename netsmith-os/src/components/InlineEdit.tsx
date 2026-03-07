import { useState } from 'react';

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  label?: string;
  multiline?: boolean;
}

export function InlineEdit({ value, onSave, label, multiline = false }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(value);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const save = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) { e.preventDefault(); save(); }
    if (e.key === 'Escape') cancel();
  };

  if (editing) {
    return (
      <div className="inline-edit-active" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {multiline ? (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            rows={3}
            style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--accent-primary)', borderRadius: 4, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 'inherit', resize: 'vertical', fontFamily: 'inherit' }}
          />
        ) : (
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--accent-primary)', borderRadius: 4, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 'inherit', fontFamily: 'inherit' }}
          />
        )}
        <button onClick={save} disabled={saving} style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 4, color: 'var(--accent-primary)', cursor: 'pointer' }}>
          {saving ? '...' : '✓'}
        </button>
        <button onClick={cancel} style={{ fontSize: 11, padding: '2px 8px', background: 'none', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer' }}>
          ✕
        </button>
      </div>
    );
  }

  return (
    <span className="inline-edit-display" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span>{value || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>not set</span>}</span>
      <button
        onClick={startEdit}
        title={`Edit ${label || 'value'}`}
        style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, padding: '0 2px', color: 'var(--text-muted)', fontSize: 12, transition: 'opacity 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
      >
        ✏️
      </button>
    </span>
  );
}
