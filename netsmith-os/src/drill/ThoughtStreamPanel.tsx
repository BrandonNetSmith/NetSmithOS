import { useState, useEffect, useRef } from "react";
import type { ThoughtEvent } from "../api/types";

interface ThoughtStreamPanelProps {
  agentId: string;
}

export function ThoughtStreamPanel({ agentId }: ThoughtStreamPanelProps) {
  const [events, setEvents] = useState<ThoughtEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Handle scroll — disable auto-scroll when user scrolls up
  const handleScroll = () => {
    if (!bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  // Connect to SSE stream
  useEffect(() => {
    const source = new EventSource(`/api/agents/${agentId}/stream`);
    streamRef.current = source;

    source.onmessage = (ev) => {
      try {
        const data: ThoughtEvent = JSON.parse(ev.data);
        if (data.type === "connected") {
          setConnected(true);
          setError(null);
          return;
        }
        if (data.type === "thought") {
          setEvents((prev) => {
            const next = [...prev, data];
            // Keep max 200 events in memory
            return next.length > 200 ? next.slice(-200) : next;
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    source.onerror = () => {
      setConnected(false);
      setError("Stream disconnected, reconnecting...");
    };

    return () => {
      source.close();
      streamRef.current = null;
    };
  }, [agentId]);

  const clearEvents = () => setEvents([]);

  const getEventIcon = (event: ThoughtEvent): string => {
    if (event.toolName) return "\u2699\uFE0F";
    if (event.event === "session.start" || event.event === "session_start") return "\u25B6";
    if (event.event === "session.end" || event.event === "session_end") return "\u23F9";
    if (event.event === "message" || event.event === "response") return "\u1F4AC";
    if (event.level === "error") return "\u274C";
    if (event.level === "warn") return "\u26A0\uFE0F";
    return "\u2022";
  };

  const getEventClass = (event: ThoughtEvent): string => {
    if (event.toolName) return "thought-tool";
    if (event.level === "error") return "thought-error";
    if (event.level === "warn") return "thought-warn";
    if (event.event?.includes("session")) return "thought-session";
    return "thought-info";
  };

  const formatTime = (ts: number): string => {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="drill-panel thought-stream-panel">
      <div className="drill-panel-header">
        <span className="drill-panel-title">
          Thought Stream
          <span className={`thought-stream-dot ${connected ? "connected" : "disconnected"}`} />
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
            {events.length} events
          </span>
          <button
            className="thought-clear-btn"
            onClick={clearEvents}
            title="Clear events"
          >
            &#x2715;
          </button>
        </div>
      </div>
      <div
        className="drill-panel-body thought-stream-body"
        ref={bodyRef}
        onScroll={handleScroll}
      >
        {error && (
          <div className="thought-stream-error">{error}</div>
        )}
        {events.length === 0 && !error && (
          <div className="thought-stream-empty">
            <p>Listening for agent activity...</p>
            <p style={{ fontSize: 10, marginTop: 4, color: "var(--text-secondary)" }}>
              Events will appear here when the agent processes tasks.
            </p>
          </div>
        )}
        {events.map((ev, i) => (
          <div key={i} className={`thought-event ${getEventClass(ev)}`}>
            <span className="thought-event-icon">{getEventIcon(ev)}</span>
            <div className="thought-event-content">
              <div className="thought-event-main">
                {ev.toolName ? (
                  <span>
                    <span className="thought-tool-name">{ev.toolName}</span>
                    {ev.toolInput && (
                      <span className="thought-tool-input">
                        {ev.toolInput.length > 120 ? ev.toolInput.slice(0, 120) + "..." : ev.toolInput}
                      </span>
                    )}
                  </span>
                ) : (
                  <span>{ev.message || ev.event || "..."}</span>
                )}
              </div>
              <div className="thought-event-meta">
                <span className="thought-event-time">{formatTime(ev.ts)}</span>
                {ev.model && <span className="thought-event-model">{ev.model}</span>}
                {ev.sessionId && (
                  <span className="thought-event-session">
                    {ev.sessionId.slice(0, 8)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {!autoScroll && events.length > 0 && (
          <button
            className="thought-scroll-btn"
            onClick={() => {
              setAutoScroll(true);
              bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
            }}
          >
            &#x2193; New events
          </button>
        )}
      </div>
    </div>
  );
}
