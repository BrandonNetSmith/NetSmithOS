import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { useSSE } from "../hooks/useSSE";
import { TopBar } from "./TopBar";
import { HexGrid } from "./HexGrid";
import type { Agent, CostSummary, Alert } from "../api/types";
import { ChatPanel } from "./ChatPanel";
import "../styles/bridge.css";

interface BridgeViewProps {
  onDrill: (agentId: string) => void;
  onForge: () => void;
}

export function BridgeView({ onDrill, onForge }: BridgeViewProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // Initial data fetch
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [agentsRes, costsRes, healthRes, alertsRes] = await Promise.allSettled([
          api.getAgents(),
          api.getCostSummary(),
          api.getHealth(),
          api.getAlerts(),
        ]);

        if (cancelled) return;

        if (agentsRes.status === "fulfilled") setAgents(agentsRes.value);
        if (costsRes.status === "fulfilled") setCosts(costsRes.value);
        if (healthRes.status === "fulfilled") {
          setGatewayOnline(healthRes.value.gateway === "online");
        }
        if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value);

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data");
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Periodic refresh as fallback (every 15s)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [agentsRes, costsRes, alertsRes] = await Promise.allSettled([
          api.getAgents(),
          api.getCostSummary(),
          api.getAlerts(),
        ]);
        if (agentsRes.status === "fulfilled") setAgents(agentsRes.value);
        if (costsRes.status === "fulfilled") setCosts(costsRes.value);
        if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value);
      } catch { /* silent fail */ }
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  // SSE real-time updates — backend sends types: "agents", "costs", "alerts"
  const handleSSE = useCallback((type: string, data: any) => {
    switch (type) {
      case "agents":
        if (Array.isArray(data)) {
          // SSE sends grouped agent summaries, merge with current state
          setAgents((prev) => {
            if (prev.length === 0) return prev;
            return prev.map((agent) => {
              const update = data.find((d: any) => d.agentId === agent.agentId);
              if (!update) return agent;
              return {
                ...agent,
                sessionCount: update.sessionCount ?? agent.sessionCount,
                lastActivity: update.latestSession?.updatedAt ?? agent.lastActivity,
                totalTokens: update.latestSession?.totalTokens ?? agent.totalTokens,
                model: update.latestSession?.model ?? agent.model,
              };
            });
          });
        }
        break;
      case "costs":
        if (data && typeof data === "object") {
          setCosts(data as CostSummary);
        }
        break;
      case "alerts":
        if (Array.isArray(data)) {
          setAlerts(data as Alert[]);
        }
        break;
      case "connected":
        console.log("SSE connected to NetSmith gateway");
        break;
    }
  }, []);

  useSSE("/api/events", handleSSE);

  if (loading) {
    return (
      <div className="bridge-view bridge-loading">
        <div className="loading-hex">
          <svg viewBox="0 0 100 100" width="80" height="80">
            <polygon
              points="50 3, 93 25, 93 75, 50 97, 7 75, 7 25"
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              className="loading-hex-spin"
            />
          </svg>
          <p>Connecting to NetSmith Gateway...</p>
        </div>
      </div>
    );
  }

  if (error && agents.length === 0) {
    return (
      <div className="bridge-view bridge-error">
        <div className="error-content">
          <h2>Gateway Unreachable</h2>
          <p>{error}</p>
          <p className="error-hint">
            Make sure the NetSmith server is running on port 7101
          </p>
          <button className="retry-btn" onClick={() => window.location.reload()}>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bridge-view">
      <TopBar
        agents={agents}
        costs={costs}
        alerts={alerts}
        gatewayOnline={gatewayOnline}
      />

      <div className="bridge-main">
        <HexGrid agents={agents} onDrill={onDrill} />
      </div>

      <footer className="bottom-bar">
        <button className="bottom-btn forge-btn" onClick={onForge}>
          <span className="btn-icon">&#x2692;</span>
          Forge New Agent
        </button>
        <button className="bottom-btn brief-btn" onClick={() => {}}>
          <span className="btn-icon">&#x2606;</span>
          Morning Brief
        </button>
        <button className="bottom-btn cron-btn" onClick={() => {}}>
          <span className="btn-icon">&#x23F0;</span>
          Cron Schedule
        </button>
        <button className="bottom-btn chat-btn" onClick={() => setChatOpen(!chatOpen)}>
          <span className="btn-icon">&#x1F4AC;</span>
          {chatOpen ? "Close Chat" : "Command"}
        </button>
      </footer>

      <ChatPanel
        agents={agents}
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
}
