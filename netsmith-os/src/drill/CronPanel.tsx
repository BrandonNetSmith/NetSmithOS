import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { CronJob, CronCreateInput } from "../api/types";

interface CronPanelProps {
  agentId: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

function formatSchedule(schedule: string | { kind: string; expr: string; tz: string }): string {
  if (typeof schedule === "string") return schedule;
  if (schedule && typeof schedule === "object") {
    const expr = schedule.expr || "unknown";
    const tz = schedule.tz ? ` (${schedule.tz})` : "";
    return `${expr}${tz}`;
  }
  return "N/A";
}

export function CronPanel({ agentId }: CronPanelProps) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [deletingJob, setDeletingJob] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newJobName, setNewJobName] = useState("");
  const [newJobMessage, setNewJobMessage] = useState("");
  const [newJobCron, setNewJobCron] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Auto-dismiss feedback after 5 seconds
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(t);
  }, [feedback]);

  const loadJobs = async () => {
    try {
      const data = await api.getAgentCron(agentId);
      setJobs(Array.isArray(data) ? data : []);
    } catch {
      // keep existing jobs on refresh failure
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getAgentCron(agentId);
        if (!cancelled) {
          setJobs(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [agentId]);

  const handleRunJob = async (jobId: string) => {
    setRunningJob(jobId);
    setFeedback(null);
    try {
      await api.runCronJob(jobId);
      const jobName = jobs.find(j => j.id === jobId)?.name || jobId;
      setFeedback({ type: "success", msg: `"${jobName}" triggered successfully` });
      // Refresh job list to get updated lastRun status
      setTimeout(loadJobs, 2000);
    } catch (err: any) {
      const msg = err?.message || err?.toString() || "Unknown error";
      setFeedback({ type: "error", msg: `Run failed: ${msg}` });
    }
    setRunningJob(null);
  };

  const handleDeleteJob = async (jobId: string) => {
    setDeletingJob(jobId);
    setFeedback(null);
    try {
      await api.deleteCronJob(jobId);
      const jobName = jobs.find(j => j.id === jobId)?.name || jobId;
      setJobs(prev => prev.filter(j => j.id !== jobId));
      setFeedback({ type: "success", msg: `"${jobName}" deleted` });
    } catch (err: any) {
      const msg = err?.message || err?.toString() || "Unknown error";
      setFeedback({ type: "error", msg: `Delete failed: ${msg}` });
    }
    setDeletingJob(null);
    setConfirmDelete(null);
  };

  const handleCreateJob = async () => {
    if (!newJobName.trim() || !newJobMessage.trim()) return;
    setCreating(true);
    setFeedback(null);
    try {
      const input: CronCreateInput = {
        agentId,
        name: newJobName.trim(),
        message: newJobMessage.trim(),
      };
      if (newJobCron.trim()) {
        input.schedule = { cron: newJobCron.trim() };
      }
      const result = await api.createCronJob(input);
      if (result && result.id) {
        setJobs(prev => [...prev, result as CronJob]);
      }
      setFeedback({ type: "success", msg: `"${newJobName.trim()}" created` });
      setNewJobName("");
      setNewJobMessage("");
      setNewJobCron("");
      setShowCreateForm(false);
    } catch (err: any) {
      const msg = err?.message || err?.toString() || "Unknown error";
      setFeedback({ type: "error", msg: `Create failed: ${msg}` });
    }
    setCreating(false);
  };

  return (
    <div className="drill-panel">
      <div className="drill-panel-header">
        <span className="drill-panel-title">Cron Jobs</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
            {jobs.length} job{jobs.length !== 1 ? "s" : ""}
          </span>
          <button
            className="cron-run-btn"
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{ marginLeft: 0 }}
          >
            {showCreateForm ? "Cancel" : "+ New Job"}
          </button>
        </div>
      </div>
      <div className="drill-panel-body">
        {/* Feedback Banner */}
        {feedback && (
          <div
            style={{
              padding: "8px 12px",
              marginBottom: 10,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: feedback.type === "success"
                ? "rgba(34, 197, 94, 0.15)"
                : "rgba(239, 68, 68, 0.15)",
              color: feedback.type === "success" ? "#22c55e" : "#ef4444",
              border: `1px solid ${feedback.type === "success" ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>{feedback.type === "success" ? "✓" : "⚠"} {feedback.msg}</span>
            <button
              onClick={() => setFeedback(null)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 14,
                padding: "0 4px",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Create Job Form */}
        {showCreateForm && (
          <div className="cron-create-form">
            <div className="cron-form-row">
              <input
                className="cron-form-input"
                type="text"
                placeholder="Job name"
                value={newJobName}
                onChange={e => setNewJobName(e.target.value)}
              />
            </div>
            <div className="cron-form-row">
              <input
                className="cron-form-input"
                type="text"
                placeholder="Message / prompt"
                value={newJobMessage}
                onChange={e => setNewJobMessage(e.target.value)}
              />
            </div>
            <div className="cron-form-row">
              <input
                className="cron-form-input"
                type="text"
                placeholder="Cron expression (e.g. */5 * * * *)"
                value={newJobCron}
                onChange={e => setNewJobCron(e.target.value)}
              />
            </div>
            <div className="cron-form-row">
              <button
                className="control-btn"
                onClick={handleCreateJob}
                disabled={creating || !newJobName.trim() || !newJobMessage.trim()}
              >
                {creating ? "Creating..." : "Create Job"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="panel-loading">Loading cron jobs...</div>
        ) : jobs.length === 0 && !showCreateForm ? (
          <div className="no-data-message">No cron jobs configured</div>
        ) : (
          <div className="cron-list">
            {jobs.map((job) => (
              <div key={job.id} className="cron-job">
                <div className="cron-job-header">
                  <span className="cron-job-name">{job.name}</span>
                  <div className="cron-job-badges">
                    <span
                      className={`cron-badge ${job.enabled ? "enabled" : "disabled"}`}
                    >
                      {job.enabled ? "Enabled" : "Disabled"}
                    </span>
                    {job.lastRun && (
                      <span
                        className={`cron-badge ${
                          job.lastRun.status === "ok"
                            ? "status-ok"
                            : "status-error"
                        }`}
                      >
                        {job.lastRun.status}
                      </span>
                    )}
                  </div>
                </div>
                {/* Show last error inline if present */}
                {job.lastError && (
                  <div style={{
                    fontSize: 11,
                    color: "#ef4444",
                    padding: "4px 0",
                    opacity: 0.85,
                    lineHeight: 1.3,
                  }}>
                    ⚠ {job.lastError}
                  </div>
                )}
                <div className="cron-job-meta">
                  <span className="cron-schedule">{formatSchedule(job.schedule)}</span>
                  {job.lastRun && (
                    <span className="cron-last-run">
                      Last: {formatTime(job.lastRun.ts)}
                    </span>
                  )}
                  <button
                    className="cron-run-btn"
                    onClick={() => handleRunJob(job.id)}
                    disabled={runningJob === job.id}
                  >
                    {runningJob === job.id ? "Running..." : "Run Now"}
                  </button>
                  {confirmDelete === job.id ? (
                    <>
                      <button
                        className="cron-delete-btn"
                        onClick={() => handleDeleteJob(job.id)}
                        disabled={deletingJob === job.id}
                      >
                        {deletingJob === job.id ? "..." : "Confirm"}
                      </button>
                      <button
                        className="cron-run-btn"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="cron-delete-btn"
                      onClick={() => setConfirmDelete(job.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
