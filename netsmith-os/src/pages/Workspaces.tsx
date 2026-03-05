import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Agent {
  name: string
  key: string
  tagline: string
  avatar: string
}

interface FileInfo {
  name: string
  size: string
  path: string
}

const agents: Agent[] = [
  {
    name: 'Tim (Main)',
    key: 'main',
    tagline: 'COO • Primary Operations',
    avatar: '🧠'
  },
  {
    name: 'Clay',
    key: 'clay',
    tagline: 'Community Agent • Discord Support',
    avatar: '🦞'
  }
]

export default function Workspaces() {
  const [selectedAgent, setSelectedAgent] = useState<Agent>(agents[0])
  const [files, setFiles] = useState<FileInfo[]>([])
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [editContent, setEditContent] = useState('')
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [workspacePath, setWorkspacePath] = useState('')

  useEffect(() => {
    loadFiles()
  }, [selectedAgent])

  const loadFiles = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/workspace/${selectedAgent.key}/files`)
      if (!res.ok) throw new Error('Failed to load files')

      const data = await res.json()
      setFiles(data.files || [])
      setWorkspacePath(data.path || '')
      setSelectedFile(null)
      setFileContent('')
      setMode('preview')
    } catch (err) {
      console.error('Failed to load files:', err)
      setError(err instanceof Error ? err.message : 'Failed to load files')
      setFiles([])
    } finally {
      setIsLoading(false)
    }
  }

  const loadFile = async (file: FileInfo) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/workspace/${selectedAgent.key}/file?path=${encodeURIComponent(file.path)}`)
      if (!res.ok) throw new Error('Failed to load file')

      const data = await res.json()
      setSelectedFile(file)
      setFileContent(data.content)
      setEditContent(data.content)
      setMode('preview')
    } catch (err) {
      console.error('Failed to load file:', err)
      setError(err instanceof Error ? err.message : 'Failed to load file')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!selectedFile) return

    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/workspace/${selectedAgent.key}/file?path=${encodeURIComponent(selectedFile.path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent })
      })

      if (!res.ok) throw new Error('Failed to save file')

      setFileContent(editContent)
      setMode('preview')
      loadFiles()
    } catch (err) {
      console.error('Failed to save file:', err)
      setError(err instanceof Error ? err.message : 'Failed to save file')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="two-panel" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="panel-sidebar">
        <div className="sidebar-section">
          <div className="sidebar-section-title">Agents</div>
          {agents.map((agent) => (
            <div
              key={agent.key}
              className={`sidebar-item ${selectedAgent.key === agent.key ? 'active' : ''}`}
              onClick={() => setSelectedAgent(agent)}
            >
              <span style={{ marginRight: '8px' }}>{agent.avatar}</span>
              {agent.name}
            </div>
          ))}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Files</div>
          {isLoading && !selectedFile ? (
            <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Loading...
            </div>
          ) : files.length === 0 ? (
            <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No .md files found
            </div>
          ) : (
            files.map((file) => (
              <div
                key={file.name}
                className={`sidebar-item file-item ${selectedFile?.name === file.name ? 'active' : ''}`}
                onClick={() => loadFile(file)}
              >
                <span>📄 {file.name}</span>
                <span className="file-size">{file.size}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel-main">
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: '16px',
            color: '#ef4444',
            fontSize: '13px'
          }}>
            ⚠️ {error}
          </div>
        )}

        <div className="workspace-header">
          <div className="workspace-info">
            <h2>{selectedAgent.avatar} {selectedAgent.name}</h2>
            <div className="workspace-tagline">{selectedAgent.tagline}</div>
            <div className="workspace-path">{workspacePath}</div>
          </div>
        </div>

        {selectedFile ? (
          <>
            <div className="file-header">
              <div className="file-title">{selectedFile.name}</div>
              <div className="mode-toggle">
                <button
                  className={`mode-btn ${mode === 'preview' ? 'active' : ''}`}
                  onClick={() => setMode('preview')}
                >
                  Preview
                </button>
                <button
                  className={`mode-btn ${mode === 'edit' ? 'active' : ''}`}
                  onClick={() => setMode('edit')}
                >
                  Edit
                </button>
                {mode === 'edit' && (
                  <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={isSaving}
                    style={{ marginLeft: '8px' }}
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                )}
              </div>
            </div>

            {isLoading ? (
              <div style={{ padding: '24px', color: 'var(--text-muted)' }}>
                Loading file...
              </div>
            ) : mode === 'preview' ? (
              <div className="markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {fileContent}
                </ReactMarkdown>
              </div>
            ) : (
              <textarea
                className="textarea-edit"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📁</div>
            <p>Select a file to view its contents</p>
          </div>
        )}
      </div>
    </div>
  )
}
