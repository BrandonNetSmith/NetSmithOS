import { useState, useEffect, useRef } from "react";
import { useToast } from "../components/Toast";
import { createPortal } from "react-dom";
import { api } from "../api/client";
import type { ModelInfo } from "../api/types";

interface AgentControlBarProps {
  agentId: string;
  currentModel: string | null;
  agentStatus: string;
  onAgentDeleted: () => void;
  onAgentRenamed: (newName: string) => void;
  onStopped?: () => void;
}

const THINKING_LEVELS = [
  { value: "off", label: "Off" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function groupModels(models: ModelInfo[]): Map<string, ModelInfo[]> {
  const groups = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const provider = m.provider.charAt(0).toUpperCase() + m.provider.slice(1);
    if (!groups.has(provider)) groups.set(provider, []);
    groups.get(provider)!.push(m);
  }
  return groups;
}

export function AgentControlBar({ agentId, currentModel, agentStatus, onAgentDeleted, onAgentRenamed, onStopped }: AgentControlBarProps) {
  const toast = useToast();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState(currentModel || "");
  const [thinkingLevel, setThinkingLevel] = useState("off");
  const [saving, setSaving] = useState<string | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    api.getModels().then(data => setModels(data.models)).catch(() => {});
    api.getAgentConfig(agentId).then(config => {
      setSelectedModel(config.model || "");
      setThinkingLevel(config.thinkingLevel || "off");
    }).catch(() => {});
  }, [agentId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showModelDropdown) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        modelBtnRef.current && !modelBtnRef.current.contains(target)
      ) {
        setShowModelDropdown(false);
        setModelSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showModelDropdown]);

  // Reposition dropdown on scroll/resize
  useEffect(() => {
    if (!showModelDropdown || !modelBtnRef.current) return;
    function updatePos() {
      if (modelBtnRef.current) {
        const rect = modelBtnRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 4, left: rect.left });
      }
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [showModelDropdown]);

  const handleModelChange = async (modelKey: string) => {
    setSelectedModel(modelKey);
    setShowModelDropdown(false);
    setModelSearch("");
    setSaving("model");
    try {
      await api.updateAgentModel(agentId, modelKey);
      toast.success(`Model updated to ${modelKey.split("/").pop()}`);
    } catch (err) {
      toast.error(`Failed to update model: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setSaving(null);
  };

  const handleThinkingChange = async (level: string) => {
    setThinkingLevel(level);
    setSaving("thinking");
    try {
      await api.updateAgentThinking(agentId, level);
      toast.success(`Thinking set to ${level}`);
    } catch (err) {
      toast.error(`Failed to update thinking: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setSaving(null);
  };

  const handleStop = async () => {
    setSaving("stop");
    try {
      await api.stopAgent(agentId);
      toast.info("Agent stop signal sent");
      // Immediately trigger parent refresh
      onStopped?.();
      // Poll for status update: check every 2s for 10s
      let polls = 0;
      const pollInterval = setInterval(async () => {
        polls++;
        onStopped?.();
        if (polls >= 5) {
          clearInterval(pollInterval);
          setSaving(null);
        }
      }, 2000);
      // Clear saving state after brief delay (button text)
      setTimeout(() => setSaving(null), 1500);
    } catch (err) {
      toast.error(`Failed to stop agent: ${err instanceof Error ? err.message : "Unknown error"}`);
      setSaving(null);
    }
  };

  const handleDelete = async () => {
    setSaving("delete");
    try {
      const result = await api.deleteAgent(agentId);
      if (result.success) {
        toast.success("Agent deleted");
        onAgentDeleted();
      }
    } catch (err) {
      toast.error(`Failed to delete agent: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setSaving(null);
    setShowDeleteConfirm(false);
  };

  const handleRename = async () => {
    if (!renameValue.trim()) return;
    setSaving("rename");
    try {
      const result = await api.renameAgent(agentId, renameValue.trim());
      if (result.success) {
        toast.success(`Agent renamed to "${renameValue.trim()}"`);
        onAgentRenamed(renameValue.trim());
      }
    } catch (err) {
      toast.error(`Failed to rename agent: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setSaving(null);
    setRenaming(false);
  };

  const filteredModels = modelSearch
    ? models.filter(m =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.key.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.provider.toLowerCase().includes(modelSearch.toLowerCase())
      )
    : models;

  const groupedModels = groupModels(filteredModels);

  const currentModelDisplay = models.find(m => m.key === selectedModel)?.name
    || selectedModel?.split("/").pop()
    || "Default";

  // Portal dropdown — renders at document.body level, escaping all stacking contexts
  const dropdownPortal = showModelDropdown
    ? createPortal(
        <div
          ref={dropdownRef}
          className="control-dropdown-menu model-dropdown"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          <input
            className="model-search-input"
            type="text"
            placeholder="Search models..."
            value={modelSearch}
            onChange={e => setModelSearch(e.target.value)}
            autoFocus
          />
          <div className="model-list">
            {[...groupedModels.entries()].map(([provider, providerModels]) => (
              <div key={provider} className="model-group">
                <div className="model-group-label">{provider}</div>
                {providerModels.map(m => (
                  <button
                    key={m.key}
                    className={`model-option ${m.key === selectedModel ? "selected" : ""}`}
                    onClick={() => handleModelChange(m.key)}
                  >
                    <span className="model-option-name">{m.name}</span>
                    {m.contextWindow && (
                      <span className="model-option-ctx">{Math.round(m.contextWindow / 1000)}K</span>
                    )}
                    {m.reasoning && <span className="model-option-badge">Thinking</span>}
                  </button>
                ))}
              </div>
            ))}
            {groupedModels.size === 0 && (
              <div className="no-data-message">No models match &quot;{modelSearch}&quot;</div>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="agent-control-bar">
      {/* Model Dropdown */}
      <div className="control-group">
        <label className="control-label">Model</label>
        <button
          className="control-dropdown-btn"
          ref={modelBtnRef}
          onClick={() => setShowModelDropdown(!showModelDropdown)}
        >
          <span className="control-dropdown-value">{saving === "model" ? "Saving..." : currentModelDisplay}</span>
          <span className="control-dropdown-arrow">&#9662;</span>
        </button>
      </div>

      {/* Portal-rendered dropdown */}
      {dropdownPortal}

      {/* Thinking Level */}
      <div className="control-group">
        <label className="control-label">Thinking</label>
        <select
          className="control-select"
          value={thinkingLevel}
          onChange={e => handleThinkingChange(e.target.value)}
          disabled={saving === "thinking"}
        >
          {THINKING_LEVELS.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Action Buttons */}
      <div className="control-actions">
        {(agentStatus === "active" || agentStatus === "busy") && (
          <button className="control-btn stop-btn" onClick={handleStop} disabled={saving === "stop"}>
            {saving === "stop" ? "Stopping..." : "Stop"}
          </button>
        )}

        {renaming ? (
          <div className="rename-inline">
            <input
              className="rename-input"
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleRename(); }}
              autoFocus
              placeholder="New name..."
            />
            <button className="control-btn" onClick={handleRename} disabled={saving === "rename"}>
              {saving === "rename" ? "..." : "Save"}
            </button>
            <button className="control-btn" onClick={() => setRenaming(false)}>Cancel</button>
          </div>
        ) : (
          <button className="control-btn" onClick={() => { setRenaming(true); setRenameValue(""); }}>
            Rename
          </button>
        )}

        {agentId !== "main" && (
          showDeleteConfirm ? (
            <div className="delete-confirm">
              <span className="delete-confirm-text">Delete this agent?</span>
              <button className="control-btn delete-btn" onClick={handleDelete} disabled={saving === "delete"}>
                {saving === "delete" ? "Deleting..." : "Yes, Delete"}
              </button>
              <button className="control-btn" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            </div>
          ) : (
            <button className="control-btn delete-trigger" onClick={() => setShowDeleteConfirm(true)}>
              Delete
            </button>
          )
        )}
      </div>
    </div>
  );
}
