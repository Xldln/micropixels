import { useState } from 'react'
import { useFiles } from '../context/FileContext'
import './CompressPanel.css'

export default function RebuildPanel({ compact }) {
  const { getResults, addResult, removeResult } = useFiles()
  const compressResults = getResults('compress')
  const rebuildResults = getResults('rebuild')
  const [rebuilding, setRebuilding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [selectedForRebuild, setSelectedForRebuild] = useState(null)

  const handleRebuild = async () => {
    const source = selectedForRebuild || compressResults
    const sources = Array.isArray(source) ? source : [source]
    if (!sources.length) return

    setRebuilding(true)
    setProgress(0)

    for (let i = 0; i < sources.length; i++) {
      const item = sources[i]
      try {
        const response = await fetch(item.blobUrl)
        const blob = await response.blob()
        const name = item.name
          .replace('_c.jpg', '_r.jpg')
          .replace(/\.\w+$/, '_r.$&')
        addResult(name, blob, 'image', 'rebuild')
      } catch (err) {
        console.error(`Failed to rebuild ${item.name}:`, err)
      }
      setProgress(Math.round(((i + 1) / sources.length) * 100))
      await sleep(50)
    }

    setRebuilding(false)
    setProgress(0)
  }

  const handleDownload = (item) => {
    const a = document.createElement('a')
    a.href = item.blobUrl
    a.download = item.name
    a.click()
  }

  const CompressedList = (
    <div className="section">
      <h3 className="section-title">
        Compressed Files ({compressResults.length})
      </h3>
      <div className="file-list">
        {compressResults.length === 0 ? (
          <p className="empty-hint">Run compression first</p>
        ) : (
          compressResults.map((r) => (
            <div
              key={r.id}
              className={`file-item ${selectedForRebuild?.id === r.id ? 'selected' : ''}`}
              onClick={() =>
                setSelectedForRebuild(
                  selectedForRebuild?.id === r.id ? null : r,
                )
              }
            >
              <span className="file-icon">📦</span>
              <span className="file-name">{r.name}</span>
              <span className="file-badge">{formatSize(r.blob?.size)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )

  const RebuildBtn = (
    <div className="section">
      <button
        className="btn btn-primary"
        onClick={handleRebuild}
        disabled={rebuilding || compressResults.length === 0}
      >
        {rebuilding ? `Rebuilding… ${progress}%` : 'Rebuild'}
      </button>
      {rebuilding && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )

  const Results = (
    <div className="section">
      <h3 className="section-title">
        Rebuilt Results ({rebuildResults.length})
      </h3>
      <div className="result-list">
        {rebuildResults.length === 0 ? (
          <p className="empty-hint">No rebuilt results yet</p>
        ) : (
          rebuildResults.map((r) => (
            <div key={r.id} className="result-item">
              <span className="file-icon">🔄</span>
              <span className="file-name" title={r.name}>
                {r.name}
              </span>
              <span className="file-badge">{formatSize(r.blob?.size)}</span>
              <button className="btn btn-sm" onClick={() => handleDownload(r)}>
                ↓
              </button>
              <button
                className="btn btn-sm"
                onClick={() => removeResult(r.id)}
                style={{ color: '#ef4444' }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className={`panel ${compact ? 'panel-compact' : ''}`}>
      <div className="panel-body">
        {CompressedList}
        {RebuildBtn}
        {Results}
      </div>
    </div>
  )
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
