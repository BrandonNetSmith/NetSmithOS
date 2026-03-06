import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { useSSE } from "../hooks/useSSE";
import { TopBar } from "./TopBar";
import { HexGrid } from "./HexGrid";
import type { Agent, AppMode, CostSummary, Alert } from "../api/types";
import "../styles/bridge.css";

interface BridgeViewProps {
  agents: Agent[];
  onDrill: (agentId: string) => void;
  onForge: () => void;
  onNavigate: (mode: AppMode) => void;
  onChatToggle: () => void;
}

export function BridgeView({ agents: externalAgents, onDrill, onForge, onNavigate, onChatToggle }: BridgeViewProps) {
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial data fetch (costs, health, alerts only — agents come from ModeRouter)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [costsRes, healthRes, alertsRes] = await Promise.allSettled([
          api.getCostSummary(),
          api.getHealth(),
          api.getAlerts(),
        ]);

        if (cancelled) return;

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

  // Periodic refresh for costs/alerts (every 15s)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [costsRes, alertsRes] = await Promise.allSettled([
          api.getCostSummary(),
          api.getAlerts(),
        ]);
        if (costsRes.status === "fulfilled") setCosts(costsRes.value);
        if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value);
      } catch { /* silent fail */ }
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  // SSE real-time updates
  const handleSSE = useCallback((type: string, data: any) => {
    switch (type) {
      case "costs":
        if (data && typeof data === "object") setCosts(data as CostSummary);
        break;
      case "alerts":
        if (Array.isArray(data)) setAlerts(data as Alert[]);
        break;
      case "connected":
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

  if (error && externalAgents.length === 0) {
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
        agents={externalAgents}
        costs={costs}
        alerts={alerts}
        gatewayOnline={gatewayOnline}
        onNavigate={onNavigate}
      />

      <div className="bridge-main">
        <HexGrid agents={externalAgents} onDrill={onDrill} />
      </div>

      <footer className="bottom-bar">
        <button className="bottom-btn forge-btn" onClick={onForge}>
          <span className="btn-icon">&#x2692;</span>
          Forge New Agent
        </button>
        <button className="bottom-btn brief-btn" onClick={() => onNavigate("activity")}>
          <span className="btn-icon">&#x2606;</span>
          Morning Brief
        </button>
        <button className="bottom-btn cron-btn" onClick={() => onNavigate("tasks")}>
          <span className="btn-icon">&#x23F0;</span>
          Cron Schedule
        </button>
        <button className="bottom-btn chat-btn" onClick={onChatToggle}>
          <span className="btn-icon">&#x1F4AC;</span>
          Command
        </button>
      </footer>
    </div>
  );
}
