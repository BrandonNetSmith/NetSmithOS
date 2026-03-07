import { useState, useEffect, useCallback } from 'react';
import { InlineEdit } from '../components/InlineEdit';
import { AgentAvatar } from '../components/AgentAvatar';
import { api } from '../api/client';
import type { Agent, AgentConfig, ModelInfo } from '../api/types';
import './Settings.css';

type SettingsTab = 'agents' | 'system' | 'integrations';

interface AgentConfigState {
  [agentId: string]: AgentConfig;
}

export default function Settings() {
  const [tab, setTab] = useState<SettingsTab>('agents');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [configs, setConfigs] = useState<AgentConfigState>({});
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // System config state
  const [systemInfo, setSystemInfo] = useState<any>(null);

  // GHL integration state
  const [ghlConnected, setGhlConnected] = useState<boolean | null>(null);
  const [ghlStats, setGhlStats] = useState<any>(null);
  const [ghlTesting, setGhlTesting] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // GHL connection test
  const testGhlConnection = useCallback(async () => {
    setGhlTesting(true);
    try {
      const result = await api.ghlTest();
      setGhlConnected(result.connected);
      if (result.connected) {
        showToast('GoHighLevel connected!');
        // Fetch stats after successful connection
        try {
          const stats = await api.ghlGetStats();
          setGhlStats(stats);
        } catch { /* stats fetch optional */ }
      } else {
        showToast('GHL connection failed: ' + (result.error || 'Unknown error'));
      }
    } catch (err: any) {
      setGhlConnected(false);
      showToast('GHL connection error: ' + (err.message || 'Failed'));
    }
    setGhlTesting(false);
  }, [showToast]);

  // Load agents + models
  useEffect(() => {
    const load = async () => {
      try {
        const [agentsData, modelsData] = await Promise.all([
          api.getAgents(),
          api.getModels(),
        ]);
        setAgents(agentsData);
        setModels(modelsData.models || []);

        // Load configs for all agents
        const configPromises = agentsData.map(async (a: Agent) => {
          const id = a.agentId || a.id;
          try {
            const cfg = await api.getAgentConfig(id);
            return { id, cfg };
          } catch {
            return { id, cfg: null };
          }
        });
        const cfgResults = await Promise.all(configPromises);
        const cfgMap: AgentConfigState = {};
        cfgResults.forEach(({ id, cfg }) => { if (cfg) cfgMap[id] = cfg; });
        setConfigs(cfgMap);
      } catch (e) {
      }
      setLoading(false);
    };
    load();
  }, []);

  // Load system info
  useEffect(() => {
    if (tab === 'system') {
      fetch('/api/health').then(r => r.json()).then(setSystemInfo).catch(() => {});
    }
  }, [tab]);

  // ── Agent Config Handlers ────────────────────────────────────────────────

  const handleRename = async (agentId: string, newName: string) => {
    setSaving(agentId + '-name');
    try {
      await api.renameAgent(agentId, newName);
      setAgents(prev => prev.map(a => (a.agentId || a.id) === agentId ? { ...a, name: newName } : a));
      showToast(`Renamed to "${newName}"`);
    } catch (e: any) {
      showToast('Failed to rename: ' + e.message);
    }
    setSaving(null);
  };

  const handleModelChange = async (agentId: string, model: string) => {
    setSaving(agentId + '-model');
    try {
      await api.updateAgentModel(agentId, model);
      setConfigs(prev => ({
        ...prev,
        [agentId]: { ...prev[agentId], model },
      }));
      showToast(`Model updated to ${model.split('/').pop()}`);
    } catch (e: any) {
      showToast('Failed to update model: ' + e.message);
    }
    setSaving(null);
  };

  const handleThinkingChange = async (agentId: string, level: string) => {
    setSaving(agentId + '-thinking');
    try {
      await api.updateAgentThinking(agentId, level);
      setConfigs(prev => ({
        ...prev,
        [agentId]: { ...prev[agentId], thinkingLevel: level },
      }));
      showToast(`Thinking set to ${level}`);
    } catch (e: any) {
      showToast('Failed to update thinking: ' + e.message);
    }
    setSaving(null);
  };

  // ── Tab content renderers ────────────────────────────────────────────────

  const renderAgentsTab = () => {
    if (loading) return <div className="settings-loading">Loading agents...</div>;

    // Deduplicate agents (main and tim are same agent)
    const seen = new Set<string>();
    const uniqueAgents = agents.filter(a => {
      const id = a.agentId || a.id;
      if (id === 'tim') return false; // skip tim alias, keep main
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    return (
      <div className="settings-agents">
        {uniqueAgents.map((agent: Agent) => {
          const agentId = agent.agentId || agent.id;
          const cfg = configs[agentId];
          const isExpanded = expandedAgent === agentId;
          const currentModel = cfg?.model || agent.model || '';
          const currentThinking = cfg?.thinkingLevel || 'off';
          const shortModel = currentModel ? currentModel.split('/').pop() || currentModel : 'default';

          return (
            <div
              className={`settings-agent-card ${isExpanded ? 'expanded' : ''}`}
              key={agentId}
            >
              {/* Header row — always visible */}
              <div
                className="settings-agent-header"
                onClick={() => setExpandedAgent(isExpanded ? null : agentId)}
              >
                <div className="settings-agent-identity">
                  <AgentAvatar agentId={agentId} size={40} />
                  <div className="settings-agent-info">
                    <div className="settings-agent-name">
                      <InlineEdit
                        value={agent.name || agentId}
                        label="agent name"
                        onSave={(v) => handleRename(agentId, v)}
                      />
                    </div>
                    <div className="settings-agent-meta">
                      <span className="settings-agent-role">{agent.role || agentId}</span>
                      <span className="settings-agent-model-badge">{shortModel}</span>
                    </div>
                  </div>
                </div>
                <div className="settings-agent-right">
                  <span className={`status-badge ${agent.status === 'busy' ? 'active' : agent.status === 'active' ? 'scaffolded' : 'inactive'}`}>
                    {agent.status || 'idle'}
                  </span>
                  <span className={`settings-chevron ${isExpanded ? 'open' : ''}`}>&#9662;</span>
                </div>
              </div>

              {/* Expanded config panel */}
              {isExpanded && (
                <div className="settings-agent-expanded">
                  {/* Model Selector */}
                  <div className="settings-field">
                    <label className="settings-field-label">Model</label>
                    <select
                      className="settings-select"
                      value={currentModel}
                      onChange={(e) => handleModelChange(agentId, e.target.value)}
                      disabled={saving === agentId + '-model'}
                    >
                      <option value="">Default</option>
                      {models.map((m: ModelInfo) => (
                        <option key={m.key} value={m.key}>
                          {m.name || m.key} {m.reasoning ? '🧠' : ''}
                        </option>
                      ))}
                    </select>
                    {saving === agentId + '-model' && <span className="settings-saving">Saving...</span>}
                  </div>

                  {/* Thinking Level */}
                  <div className="settings-field">
                    <label className="settings-field-label">Thinking Level</label>
                    <div className="settings-thinking-buttons">
                      {['off', 'minimal', 'low', 'medium', 'high'].map(level => (
                        <button
                          key={level}
                          className={`settings-thinking-btn ${currentThinking === level ? 'active' : ''}`}
                          onClick={() => handleThinkingChange(agentId, level)}
                          disabled={saving === agentId + '-thinking'}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Identity */}
                  {cfg?.identity && (
                    <div className="settings-field">
                      <label className="settings-field-label">Identity</label>
                      <div className="settings-identity-preview">{cfg.identity}</div>
                    </div>
                  )}

                  {/* Workspace */}
                  {cfg?.workspace && (
                    <div className="settings-field">
                      <label className="settings-field-label">Workspace</label>
                      <code className="settings-code">{cfg.workspace.replace('/home/brandon/', '~/')}</code>
                    </div>
                  )}

                  {/* Heartbeat */}
                  {cfg?.heartbeat && (
                    <div className="settings-field">
                      <label className="settings-field-label">Heartbeat</label>
                      <code className="settings-code">{JSON.stringify(cfg.heartbeat)}</code>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderSystemTab = () => (
    <div className="settings-system">
      {/* Server Info */}
      <div className="settings-section">
        <div className="settings-section-title">Server</div>
        <div className="settings-info-grid">
          <div className="settings-info-card">
            <div className="settings-info-label">API Server</div>
            <div className="settings-info-value">
              <code>:7101</code>
              <span className="settings-status-dot online" />
            </div>
          </div>
          <div className="settings-info-card">
            <div className="settings-info-label">Frontend</div>
            <div className="settings-info-value">
              <code>:7100</code>
              <span className="settings-status-dot online" />
            </div>
          </div>
          <div className="settings-info-card">
            <div className="settings-info-label">Gateway</div>
            <div className="settings-info-value">
              <code>:3000</code>
              {systemInfo?.gateway ? (
                <span className="settings-status-dot online" />
              ) : (
                <span className="settings-status-dot offline" />
              )}
            </div>
          </div>
          <div className="settings-info-card">
            <div className="settings-info-label">Uptime</div>
            <div className="settings-info-value">
              {systemInfo?.uptime ? `${Math.floor(systemInfo.uptime / 3600)}h ${Math.floor((systemInfo.uptime % 3600) / 60)}m` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="settings-section">
        <div className="settings-section-title">API Keys</div>
        <div className="settings-info-grid">
          {[
            { name: 'OpenRouter', env: 'OPENROUTER_API_KEY' },
            { name: 'OpenAI', env: 'OPENAI_API_KEY' },
            { name: 'Anthropic', env: 'ANTHROPIC_API_KEY' },
            { name: 'Google', env: 'GOOGLE_API_KEY' },
          ].map(k => (
            <div className="settings-info-card" key={k.env}>
              <div className="settings-info-label">{k.name}</div>
              <div className="settings-info-value">
                <code className="settings-api-key-mask">••••••••</code>
                <span className="settings-status-dot online" title="Configured" />
              </div>
            </div>
          ))}
        </div>
        <p className="settings-hint">API keys are configured via environment variables on the server.</p>
      </div>

      {/* Agent Count & Models */}
      <div className="settings-section">
        <div className="settings-section-title">Fleet Overview</div>
        <div className="settings-info-grid">
          <div className="settings-info-card">
            <div className="settings-info-label">Total Agents</div>
            <div className="settings-info-value settings-info-big">{agents.length}</div>
          </div>
          <div className="settings-info-card">
            <div className="settings-info-label">Available Models</div>
            <div className="settings-info-value settings-info-big">{models.length}</div>
          </div>
          <div className="settings-info-card">
            <div className="settings-info-label">Active</div>
            <div className="settings-info-value settings-info-big">
              {agents.filter(a => a.status === 'busy' || a.status === 'active').length}
            </div>
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="settings-section">
        <div className="settings-section-title">Appearance</div>
        <div className="settings-info-grid">
          <div className="settings-info-card">
            <div className="settings-info-label">Theme</div>
            <div className="settings-info-value">
              <span className="settings-theme-indicator">Phosphor Dark</span>
              <span className="settings-theme-swatch" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderIntegrationsTab = () => (
    <div className="settings-integrations">
      {/* GoHighLevel */}
      <div className="settings-integration-card">
        <div className="settings-integration-header">
          <div className="settings-integration-icon">📊</div>
          <div className="settings-integration-info">
            <div className="settings-integration-name">GoHighLevel</div>
            <div className="settings-integration-desc">CRM, pipelines, contacts & automation</div>
          </div>
          <span className={`settings-integration-status ${ghlConnected === true ? 'online' : ghlConnected === false ? 'error' : 'pending'}`}>
            {ghlConnected === true ? 'Connected' : ghlConnected === false ? 'Error' : 'Not Tested'}
          </span>
        </div>
        <div className="settings-integration-details">
          <div className="settings-info-row">
            <div>
              <div className="settings-info-label">Location ID</div>
              <code className="settings-code">GZecKV1IvZgcZdeVItxt</code>
            </div>
            <button
              className="settings-btn settings-btn-sm"
              onClick={testGhlConnection}
              disabled={ghlTesting}
            >
              {ghlTesting ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
          {ghlStats && ghlConnected && (
            <div className="settings-ghl-stats">
              <div className="settings-info-grid" style={{ marginTop: '12px' }}>
                <div className="settings-info-card">
                  <div className="settings-info-label">Contacts</div>
                  <div className="settings-info-value settings-info-big">{ghlStats.contacts?.total ?? '—'}</div>
                </div>
                <div className="settings-info-card">
                  <div className="settings-info-label">Open Opps</div>
                  <div className="settings-info-value settings-info-big">{ghlStats.opportunities?.openCount ?? '—'}</div>
                </div>
                <div className="settings-info-card">
                  <div className="settings-info-label">Pipeline Value</div>
                  <div className="settings-info-value settings-info-big">
                    ${ghlStats.opportunities?.totalValue ? (ghlStats.opportunities.totalValue / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—'}
                  </div>
                </div>
                <div className="settings-info-card">
                  <div className="settings-info-label">Pipelines</div>
                  <div className="settings-info-value settings-info-big">{ghlStats.pipelines?.length ?? '—'}</div>
                </div>
              </div>
              {ghlStats.pipelines && ghlStats.pipelines.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  {ghlStats.pipelines.map((p: any) => (
                    <div key={p.id} className="settings-ghl-pipeline-row">
                      <span className="settings-ghl-pipeline-name">{p.name}</span>
                      <span className="settings-ghl-pipeline-count">{p.opportunityCount} opps</span>
                      <span className="settings-ghl-pipeline-value">
                        ${p.totalValue ? (p.totalValue / 100).toLocaleString() : '0'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Slack */}
      <div className="settings-integration-card">
        <div className="settings-integration-header">
          <div className="settings-integration-icon">💬</div>
          <div className="settings-integration-info">
            <div className="settings-integration-name">Slack</div>
            <div className="settings-integration-desc">Webhook notifications & alerts</div>
          </div>
          <span className="settings-integration-status inactive">Not Connected</span>
        </div>
      </div>

      {/* Discord */}
      <div className="settings-integration-card">
        <div className="settings-integration-header">
          <div className="settings-integration-icon">🎮</div>
          <div className="settings-integration-info">
            <div className="settings-integration-name">Discord</div>
            <div className="settings-integration-desc">Bot & channel bindings</div>
          </div>
          <span className="settings-integration-status inactive">Not Connected</span>
        </div>
      </div>

      {/* GitHub */}
      <div className="settings-integration-card">
        <div className="settings-integration-header">
          <div className="settings-integration-icon">🐙</div>
          <div className="settings-integration-info">
            <div className="settings-integration-name">GitHub</div>
            <div className="settings-integration-desc">Repository access & pull requests</div>
          </div>
          <span className="settings-integration-status online">Connected</span>
        </div>
        <div className="settings-integration-details">
          <div className="settings-info-label">Repos managed by agents</div>
          <code className="settings-code">gh repo list (via CLI)</code>
        </div>
      </div>

      {/* IntakeQ */}
      <div className="settings-integration-card">
        <div className="settings-integration-header">
          <div className="settings-integration-icon">📋</div>
          <div className="settings-integration-info">
            <div className="settings-integration-name">IntakeQ</div>
            <div className="settings-integration-desc">Client intake forms & appointments</div>
          </div>
          <span className="settings-integration-status online">Connected</span>
        </div>
      </div>
    </div>
  );

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="page-content settings-page">
      {/* Toast notification */}
      {toast && <div className="settings-toast">{toast}</div>}

      {/* Tab bar */}
      <div className="settings-tabs">
        <button
          className={`settings-tab ${tab === 'agents' ? 'active' : ''}`}
          onClick={() => setTab('agents')}
        >
          <span className="settings-tab-icon">🤖</span>
          Agent Config
        </button>
        <button
          className={`settings-tab ${tab === 'system' ? 'active' : ''}`}
          onClick={() => setTab('system')}
        >
          <span className="settings-tab-icon">⚙️</span>
          System
        </button>
        <button
          className={`settings-tab ${tab === 'integrations' ? 'active' : ''}`}
          onClick={() => setTab('integrations')}
        >
          <span className="settings-tab-icon">🔌</span>
          Integrations
        </button>
      </div>

      {/* Tab content */}
      <div className="settings-content">
        {tab === 'agents' && renderAgentsTab()}
        {tab === 'system' && renderSystemTab()}
        {tab === 'integrations' && renderIntegrationsTab()}
      </div>
    </div>
  );
}
