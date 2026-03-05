import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { SessionPanel } from "./SessionPanel";
import { MemoryPanel } from "./MemoryPanel";
import { CostPanel } from "./CostPanel";
import { CronPanel } from "./CronPanel";
import { FilePanel } from "./FilePanel";
import { AgentControlBar } from "./AgentControlBar";
import type { Agent, Session } from "../api/types";
import { ThoughtStreamPanel } from "./ThoughtStreamPanel";
import "../styles/drill.css";

interface DrillViewProps {
  agentId: string;
  onBack: () => void;
  onAgentDeleted: () => void;
}

export function DrillView({ agentId, onBack, onAgentDeleted }: DrillViewProps) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial data fetch
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const agents = await api.getAgents();
        if (cancelled) return;
        const found = agents.find(
          (a) => a.agentId === agentId || a.id === agentId
        );
        if (found) setAgent(found);

        const sessionsData = await api.getAgentSessions(agentId);
        if (cancelled) return;
        setSessions(sessionsData.sessions || []);
      } catch {
        /* silently handle errors */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [agentId]);

  // 15-second polling refresh for sessions and costs
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const sessionsData = await api.getAgentSessions(agentId);
        setSessions(sessionsData.sessions || []);
      } catch {
        /* silent fail */
      }
    }, 15_000);

    return () => clearInterval(interval);
  }, [agentId]);

  const handleAgentRenamed = useCallback((newName: string) => {
    setAgent(prev => prev ? { ...prev, name: newName } : prev);
  }, []);

  if (loading) {
    return (
      <div className="drill-view">
        <div className="drill-header">
          <button className="drill-back-btn" onClick={onBack}>
            &larr; Bridge
          </button>
        </div>
        <div className="drill-loading">
          <div className="drill-loading-inner">
            <svg viewBox="0 0 100 100" width="60" height="60">
              <polygon
                points="50 3, 93 25, 93 75, 50 97, 7 75, 7 25"
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                className="drill-loading-hex"
              />
            </svg>
            <p>Loading agent data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="drill-view">
      {/* Header */}
      <div className="drill-header">
        <button className="drill-back-btn" onClick={onBack}>
          &larr; Bridge
        </button>
        <div className="drill-agent-info">
          <span className="drill-agent-emoji">{agent?.emoji || "\u2B21"}</span>
          <div className="drill-agent-details">
            <span className="drill-agent-name">
              {agent?.name || agentId}
            </span>
            <span className="drill-agent-role">
              {agent?.role || "Agent"}
            </span>
          </div>
        </div>
        <div
          className={`drill-status-indicator ${agent?.status || "idle"}`}
        >
          <span className="drill-status-dot" />
          {agent?.status || "idle"}
        </div>
      </div>

      {/* Agent Control Bar */}
      <AgentControlBar
        agentId={agentId}
        currentModel={agent?.model || null}
        agentStatus={agent?.status || "idle"}
        onAgentDeleted={onAgentDeleted}
        onAgentRenamed={handleAgentRenamed}
      />

      {/* 2-Column Grid: 6 Panels */}
      <div className="drill-content">
        <SessionPanel sessions={sessions} agentId={agentId} />
        <MemoryPanel agentId={agentId} />
        <CostPanel agentId={agentId} />
        <CronPanel agentId={agentId} />
        <FilePanel agentId={agentId} />
        {/* 6th panel: Thought Stream — live agent activity */}
        <ThoughtStreamPanel agentId={agentId} />
    </div>
    </div>
  );
}
