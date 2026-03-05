import type { CostSummary, Agent, Alert, AppMode } from "../api/types";

interface TopBarProps {
  agents: Agent[];
  costs: CostSummary | null;
  alerts: Alert[];
  gatewayOnline: boolean;
  onNavigate: (mode: AppMode) => void;
}

function formatCost(n: number): string {
  if (n < 0.01 && n > 0) return "<$0.01";
  return "$" + n.toFixed(2);
}

export function TopBar({ agents, costs, alerts, gatewayOnline, onNavigate }: TopBarProps) {
  const activeCount = agents.filter((a) => a.status === "active" || a.status === "busy").length;
  const totalCount = agents.length;
  const criticalAlerts = alerts.filter((a) => a.severity === "critical").length;
  const warningAlerts = alerts.filter((a) => a.severity === "warning").length;
  const alertCount = criticalAlerts + warningAlerts;

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <div className="top-bar-brand" onClick={() => onNavigate("boardroom")} style={{ cursor: "pointer" }} title="Open Boardroom">
          <span className="brand-icon">&#x2B22;</span>
          <span className="brand-name">NetSmith</span>
          <span className="brand-tag">BOARDROOM</span>
        </div>
      </div>

      <div className="top-bar-center">
        <div className={`status-chip ${gatewayOnline ? "online" : "offline"}`}>
          <span className="status-dot" />
          <span>Gateway: {gatewayOnline ? "ONLINE" : "OFFLINE"}</span>
        </div>
        <div
          className="status-chip agents-chip"
          onClick={() => onNavigate("org")}
          style={{ cursor: "pointer" }}
          title="View Org Chart"
        >
          <span className="status-dot active" />
          <span>
            {activeCount}/{totalCount} agents
          </span>
        </div>
      </div>

      <div className="top-bar-right">
        {costs && (
          <>
            <div
              className="cost-ticker"
              onClick={() => onNavigate("costs")}
              style={{ cursor: "pointer" }}
              title="View Cost Explorer"
            >
              <span className="cost-label">Today</span>
              <span className="cost-value">{formatCost(costs.today)}</span>
            </div>
            <div
              className="cost-ticker burn-rate"
              onClick={() => onNavigate("costs")}
              style={{ cursor: "pointer" }}
              title="View Cost Explorer"
            >
              <span className="cost-label">Burn</span>
              <span className="cost-value">
                {formatCost(costs.burnRate)}/day
              </span>
            </div>
          </>
        )}
        <div
          className={`alert-badge ${alertCount > 0 ? "has-alerts" : ""}`}
          onClick={() => onNavigate("activity")}
          style={{ cursor: "pointer" }}
          title="View Activity Log"
        >
          <span className="alert-icon">&#x26A0;</span>
          <span className="alert-count">{alertCount}</span>
        </div>
      </div>
    </header>
  );
}
