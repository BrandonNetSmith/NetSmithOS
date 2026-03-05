import { useState, useEffect, Component, type ReactNode } from 'react';
import { BridgeView } from '../bridge/BridgeView';
import { DrillView } from '../drill/DrillView';
import { ForgeView } from '../forge/ForgeView';
import { NavSidebar } from '../bridge/NavSidebar';
import { PageShell } from '../pages/PageShell';
import Health from '../pages/Health';
import OrgChart from '../pages/OrgChart';
import TaskManager from '../pages/TaskManager';
import Standup from '../pages/Standup';
import Workspaces from '../pages/Workspaces';
import Docs from '../pages/Docs';
import ActivityLog from '../pages/ActivityLog';
import CostExplorer from '../pages/CostExplorer';
import SettingsStub from '../pages/SettingsStub';
import Boardroom from '../pages/Boardroom';
import { ChatPanel } from '../bridge/ChatPanel';
import { api } from '../api/client';
import type { AppMode, Agent } from '../api/types';

interface ErrorBoundaryProps {
  fallback: (error: Error, reset: () => void) => ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  health: { title: 'System Health', subtitle: 'Live metrics for SteelClaw infrastructure' },
  org: { title: 'Org Chart', subtitle: 'NetSmith agent hierarchy and roster' },
  tasks: { title: 'Task Manager', subtitle: 'Active sessions, models, and token usage' },
  standup: { title: 'Executive Standup', subtitle: 'Kick off meetings with the chiefs' },
  workspaces: { title: 'Workspaces', subtitle: 'Agent workspace files and context' },
  docs: { title: 'Documentation', subtitle: 'Guides, references, and architecture docs' },
  activity: { title: 'Activity Log', subtitle: 'Cron runs, agent activity, and system events' },
  costs: { title: 'Cost Explorer', subtitle: 'Org-wide spend analytics and per-agent breakdowns' },
  settings: { title: 'Settings', subtitle: 'Configuration, API keys, and system preferences' },
  boardroom: { title: 'The Boardroom', subtitle: 'Executive council and agent oversight' },
};

export function ModeRouter() {
  const [mode, setMode] = useState<AppMode>('bridge');
  const [drillAgent, setDrillAgent] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

  // Fetch agents globally with 15s refresh
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.getAgents();
        if (!cancelled) setAgents(data);
      } catch { /* silent */ }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const handleDrill = (agentId: string) => {
    setDrillAgent(agentId);
    setMode('drill');
  };

  const handleBack = () => {
    setMode('bridge');
    setDrillAgent(null);
  };

  const handleNavigate = (newMode: AppMode) => {
    if (newMode !== 'drill') {
      setDrillAgent(null);
    }
    setMode(newMode);
  };

  const toggleChat = () => setChatOpen(prev => !prev);

  const errorFallback = (error: Error, reset: () => void) => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'var(--bg-primary, #0a0f1a)',
      color: 'var(--text-primary, #e2e8f0)',
      fontFamily: 'monospace',
      gap: '1rem',
      padding: '2rem',
    }}>
      <div style={{ fontSize: '2rem' }}>Something went wrong</div>
      <pre style={{
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '8px',
        padding: '1rem',
        maxWidth: '600px',
        overflow: 'auto',
        fontSize: '0.85rem',
        color: '#ef4444',
      }}>
        {error.message}
      </pre>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button
          onClick={reset}
          style={{
            padding: '0.5rem 1.5rem',
            background: '#10b981',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Retry
        </button>
        <button
          onClick={() => { handleBack(); reset(); }}
          style={{
            padding: '0.5rem 1.5rem',
            background: 'rgba(255,255,255,0.1)',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Back to Bridge
        </button>
      </div>
    </div>
  );

  // Drill view gets the full screen — no sidebar
  if (mode === 'drill' && drillAgent) {
    return (
      <ErrorBoundary fallback={errorFallback}>
        <>
          <DrillView
            agentId={drillAgent}
            onBack={handleBack}
            onAgentDeleted={handleBack}
          />
          <ChatPanel agents={agents} isOpen={chatOpen} onClose={() => setChatOpen(false)} />
          {!chatOpen && (
            <button className="chat-fab" onClick={toggleChat} title="Chat with agents">
              <span style={{ fontSize: '24px' }}>💬</span>
            </button>
          )}
        </>
      </ErrorBoundary>
    );
  }

  const renderContent = () => {
    switch (mode) {
      case 'bridge':
        return (
          <BridgeView
            agents={agents}
            onDrill={handleDrill}
            onForge={() => setMode('forge')}
            onNavigate={handleNavigate}
            onChatToggle={toggleChat}
          />
        );
      case 'forge':
        return (
          <ForgeView
            onBack={() => setMode('bridge')}
            onComplete={() => setMode('bridge')}
          />
        );
      case 'health':
        return (
          <PageShell title={PAGE_META.health.title} subtitle={PAGE_META.health.subtitle}>
            <Health />
          </PageShell>
        );
      case 'org':
        return (
          <PageShell title={PAGE_META.org.title} subtitle={PAGE_META.org.subtitle}>
            <OrgChart onDrill={handleDrill} />
          </PageShell>
        );
      case 'tasks':
        return (
          <PageShell title={PAGE_META.tasks.title} subtitle={PAGE_META.tasks.subtitle}>
            <TaskManager onNavigate={handleNavigate} />
          </PageShell>
        );
      case 'standup':
        return (
          <PageShell title={PAGE_META.standup.title} subtitle={PAGE_META.standup.subtitle}>
            <Standup agents={agents} />
          </PageShell>
        );
      case 'workspaces':
        return (
          <PageShell title={PAGE_META.workspaces.title} subtitle={PAGE_META.workspaces.subtitle}>
            <Workspaces />
          </PageShell>
        );
      case 'docs':
        return (
          <PageShell title={PAGE_META.docs.title} subtitle={PAGE_META.docs.subtitle}>
            <Docs />
          </PageShell>
        );
      case 'activity':
        return (
          <PageShell title={PAGE_META.activity.title} subtitle={PAGE_META.activity.subtitle}>
            <ActivityLog />
          </PageShell>
        );
      case 'costs':
        return (
          <PageShell title={PAGE_META.costs.title} subtitle={PAGE_META.costs.subtitle}>
            <CostExplorer />
          </PageShell>
        );
      case 'settings':
        return (
          <PageShell title={PAGE_META.settings.title} subtitle={PAGE_META.settings.subtitle}>
            <SettingsStub />
          </PageShell>
        );
      case 'boardroom':
        return (
          <PageShell title={PAGE_META.boardroom.title} subtitle={PAGE_META.boardroom.subtitle}>
            <Boardroom agents={agents} onDrill={handleDrill} />
          </PageShell>
        );
      default:
        return (
          <BridgeView
            agents={agents}
            onDrill={handleDrill}
            onForge={() => setMode('forge')}
            onNavigate={handleNavigate}
            onChatToggle={toggleChat}
          />
        );
    }
  };

  return (
    <ErrorBoundary fallback={errorFallback}>
      <div className='app-container'>
        <NavSidebar currentMode={mode} onNavigate={handleNavigate} />
        <div className='main-content'>
          {renderContent()}
        </div>
      </div>
      <ChatPanel agents={agents} isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      {!chatOpen && (
        <button className="chat-fab" onClick={toggleChat} title="Chat with agents">
          <span style={{ fontSize: '24px' }}>💬</span>
        </button>
      )}
    </ErrorBoundary>
  );
}
