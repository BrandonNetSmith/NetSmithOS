import { useState, useEffect } from "react";
import { api } from "../api/client";

interface WorkspaceFile {
  name: string;
  size: string;
  type: string;
}

interface FilePanelProps {
  agentId: string;
}

export function FilePanel({ agentId }: FilePanelProps) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getWorkspaceFiles(agentId);
        if (!cancelled) {
          setFiles(
            Array.isArray(data.files)
              ? data.files.map((f: any) => ({
                  name: f.name || f.path || String(f),
                  size: String(f.size || "0 B"),
                  type: f.type || "file",
                }))
              : []
          );
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [agentId]);

  const handleSelectFile = async (name: string) => {
    if (selectedFile === name && !editing) {
      setSelectedFile(null);
      setFileContent("");
      return;
    }
    setSelectedFile(name);
    setEditing(false);
    setLoadingFile(true);
    try {
      const data = await api.getWorkspaceFile(agentId, name);
      setFileContent(data.content);
      setEditContent(data.content);
    } catch {
      setFileContent("Failed to load file.");
    } finally {
      setLoadingFile(false);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await fetch(
        `/api/workspace/${encodeURIComponent(agentId)}/file?path=${encodeURIComponent(selectedFile)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editContent }),
        }
      );
      setFileContent(editContent);
      setEditing(false);
    } catch {
      /* silent fail */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="drill-panel">
      <div className="drill-panel-header">
        <span className="drill-panel-title">Workspace Files</span>
        <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
          {files.length} file{files.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="drill-panel-body">
        {loading ? (
          <div className="panel-loading">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="no-data-message">No workspace files</div>
        ) : (
          <div className="file-list">
            {files.map((f) => (
              <div
                key={f.name}
                className={`file-entry ${selectedFile === f.name ? "selected" : ""}`}
                onClick={() => handleSelectFile(f.name)}
              >
                <span className="file-entry-name">{f.name}</span>
                <span className="file-entry-size">{f.size}</span>
              </div>
            ))}
          </div>
        )}

        {selectedFile && (
          <div className="file-viewer">
            <div className="file-viewer-header">
              <span className="file-viewer-path">{selectedFile}</span>
              <div className="file-viewer-actions">
                {editing ? (
                  <>
                    <button
                      className="file-action-btn save-btn"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      className="file-action-btn"
                      onClick={() => {
                        setEditing(false);
                        setEditContent(fileContent);
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="file-action-btn"
                      onClick={() => setEditing(true)}
                    >
                      Edit
                    </button>
                    <button
                      className="file-action-btn"
                      onClick={() => {
                        setSelectedFile(null);
                        setFileContent("");
                      }}
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            </div>
            {loadingFile ? (
              <div className="panel-loading">Loading...</div>
            ) : editing ? (
              <textarea
                className="file-edit-textarea"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            ) : (
              <pre className="file-content-display">{fileContent}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
