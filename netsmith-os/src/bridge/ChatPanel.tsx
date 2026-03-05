import { useState, useRef, useEffect } from "react";
import { sendChat } from "../api/client";
import type { Agent, ChatMessage } from "../api/types";

interface ChatPanelProps {
  agents: Agent[];
  isOpen: boolean;
  onClose: () => void;
}

let msgCounter = 0;

export function ChatPanel({ agents, isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-select first agent
  useEffect(() => {
    if (!selectedAgent && agents.length > 0) {
      setSelectedAgent(agents[0].agentId);
    }
  }, [agents, selectedAgent]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || !selectedAgent || sending) return;

    const userMsg: ChatMessage = {
      id: `msg-${++msgCounter}`,
      role: "user",
      agentId: selectedAgent,
      content: input.trim(),
      ts: Date.now(),
    };

    const agent = agents.find((a) => a.agentId === selectedAgent);
    const loadingMsg: ChatMessage = {
      id: `msg-${++msgCounter}`,
      role: "assistant",
      agentId: selectedAgent,
      agentName: agent?.name || selectedAgent,
      agentEmoji: agent?.emoji || "\u2B21",
      content: "",
      ts: Date.now(),
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setSending(true);

    try {
      const resp = await sendChat(selectedAgent, input.trim());
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? {
                ...m,
                content: resp.response,
                model: resp.model,
                tokens: resp.tokens,
                ts: resp.ts,
                warning: resp.warning,
                loading: false,
              }
            : m
        )
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? {
                ...m,
                content: `Error: ${err instanceof Error ? err.message : "Chat failed"}`,
                loading: false,
              }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-title">&#x1F4AC; Command</span>
          <select
            className="chat-agent-select"
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
          >
            {agents.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {a.emoji} {a.name} ({a.role})
              </option>
            ))}
          </select>
        </div>
        <button className="chat-close-btn" onClick={onClose}>
          &times;
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Send a message to any agent.</p>
            <p className="chat-empty-hint">
              Select an agent above, type your message, and press Enter.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-msg chat-msg-${msg.role}`}>
            <div className="chat-msg-header">
              {msg.role === "assistant" ? (
                <span className="chat-msg-agent">
                  {msg.agentEmoji} {msg.agentName}
                </span>
              ) : (
                <span className="chat-msg-agent">&#x1F464; You</span>
              )}
              <span className="chat-msg-time">
                {new Date(msg.ts).toLocaleTimeString()}
              </span>
            </div>
            <div className="chat-msg-body">
              {msg.loading ? (
                <span className="chat-typing">
                  <span className="chat-dot" />
                  <span className="chat-dot" />
                  <span className="chat-dot" />
                </span>
              ) : (
                <span>{msg.content}</span>
              )}
            </div>
            {msg.model && !msg.loading && (
              <div className="chat-msg-meta">
                {msg.model}
                {msg.tokens?.total_tokens
                  ? ` · ${msg.tokens.total_tokens.toLocaleString()} tokens`
                  : ""}
                {msg.warning ? ` · ⚠ ${msg.warning}` : ""}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          placeholder={
            sending
              ? "Waiting for response..."
              : `Message ${agents.find((a) => a.agentId === selectedAgent)?.name || "agent"}...`
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={sending || !input.trim()}
        >
          {sending ? "..." : "\u27A4"}
        </button>
      </div>
    </div>
  );
}
