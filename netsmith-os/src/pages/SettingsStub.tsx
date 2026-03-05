import { useState, useEffect } from 'react';
import { InlineEdit } from '../components/InlineEdit';
import { api } from '../api/client';


export default function SettingsStub() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAgents().then(data => { setAgents(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const saveAgentName = async (agentId: string, newName: string) => {
    await fetch(`/api/agents/${agentId}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    setAgents(prev => prev.map(a => (a.agentId || a.id) === agentId ? { ...a, name: newName } : a));
  };

  return (
    <div className="page-content">
      <div className="section-title">Agent Configuration</div>
      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 16 }}>Loading agents...</div>
      ) : (
        <div className="card-grid">
          {agents.map((agent: any) => {
            const agentId = agent.agentId || agent.id;
            return (
              <div className="model-card" key={agentId}>
                <div className="card-header">
                  <div>
                    <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{agent.emoji || '⬡'}</span>
                      <InlineEdit
                        value={agent.name || agentId}
                        label="agent name"
                        onSave={(v) => saveAgentName(agentId, v)}
                      />
                    </div>
                    <div className="card-subtitle">{agentId}</div>
                  </div>
                  <span className={'status-badge ' + (agent.status === 'active' || agent.status === 'busy' ? 'active' : 'inactive')}>
                    {agent.status || 'idle'}
                  </span>
                </div>
                <div className="card-stats">
                  <div className="card-stat">
                    <span className="card-stat-label">Model:</span>
                    <span className="card-stat-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>{agent.model ? agent.model.split('/').pop() : 'default'}</span>
                  </div>
                  {agent.workspace && (
                    <div className="card-stat">
                      <span className="card-stat-label">Workspace:</span>
                      <span className="card-stat-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>{agent.workspace.replace('/home/brandon/', '~/')}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="section-title" style={{ marginTop: 32 }}>System</div>
      <div className="card-grid">
        <div className="model-card">
          <div className="card-header"><div className="card-title">API Server</div></div>
          <div className="card-stats">
            <div className="card-stat"><span className="card-stat-label">Port:</span><span className="card-stat-value" style={{ fontFamily: 'monospace' }}>7101</span></div>
            <div className="card-stat"><span className="card-stat-label">Frontend:</span><span className="card-stat-value" style={{ fontFamily: 'monospace' }}>7100</span></div>
          </div>
        </div>
        <div className="model-card">
          <div className="card-header"><div className="card-title">OpenClaw Gateway</div></div>
          <div className="card-stats">
            <div className="card-stat"><span className="card-stat-label">Port:</span><span className="card-stat-value" style={{ fontFamily: 'monospace' }}>3000</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
