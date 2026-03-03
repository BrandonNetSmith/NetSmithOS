import { useState, useEffect, useMemo } from "react";
import { api } from "../api/client";
import ReactMarkdown from "react-markdown";

interface MemoryEntry {
  filename: string;
  date: string;
  content: string;
  fullPath?: string;
}

interface MemoryPanelProps {
  agentId: string;
}

export function MemoryPanel({ agentId }: MemoryPanelProps) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getAgentMemory(agentId);
        if (!cancelled) {
          setEntries(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [agentId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.filename.toLowerCase().includes(q) ||
        (e.content || "").toLowerCase().includes(q)
    );
  }, [entries, search]);

  const handleSelect = async (filename: string) => {
    if (selectedFile === filename) {
      setSelectedFile(null);
      setFileContent(null);
      return;
    }
    setSelectedFile(filename);
    setLoadingFile(true);
    try {
      const data = await api.getAgentMemoryFile(agentId, filename);
      setFileContent(data.content);
    } catch {
      setFileContent("Failed to load memory file.");
    } finally {
      setLoadingFile(false);
    }
  };

  return (
    <div className="drill-panel">
      <div className="drill-panel-header">
        <span className="drill-panel-title">Memory</span>
        <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
          {entries.length} file{entries.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="drill-panel-body">
        <input
          className="memory-search"
          type="text"
          placeholder="Search memory..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading ? (
          <div className="panel-loading">Loading memory...</div>
        ) : filtered.length === 0 ? (
          <div className="no-data-message">
            {search ? "No matching memories" : "No memory files"}
          </div>
        ) : (
          <div className="memory-list">
            {filtered.map((entry) => (
              <div
                key={entry.filename}
                className="memory-entry"
                onClick={() => handleSelect(entry.filename)}
              >
                <div className="memory-entry-header">
                  <span className="memory-entry-name">{entry.filename}</span>
                  <span className="memory-entry-date">{entry.date}</span>
                </div>
                <div className="memory-entry-preview">
                  {(entry.content || "").slice(0, 120)}
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedFile && (
          <div className="memory-viewer">
            <div className="memory-viewer-header">
              <span className="memory-viewer-title">{selectedFile}</span>
              <button
                className="memory-close-btn"
                onClick={() => {
                  setSelectedFile(null);
                  setFileContent(null);
                }}
              >
                Close
              </button>
            </div>
            {loadingFile ? (
              <div className="panel-loading">Loading...</div>
            ) : (
              <div className="memory-viewer-content">
                <ReactMarkdown>{fileContent || ""}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
