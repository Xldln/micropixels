import { useState, useRef } from 'react'
import { useFiles } from '../context/FileContext'
import './CompressPanel.css'

const API_BASE = 'http://localhost:9000/micropixels'

export default function RebuildPanel({ compact, selectedBinId, onPreview, onClearBin }) {
  const { getItem, addFiles, getRebuildDir } = useFiles()
  const selectedFile = selectedBinId ? getItem(selectedBinId) : null
  const [rebuilding, setRebuilding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [localFile, setLocalFile] = useState(null)
  const fileInputRef = useRef(null)

  const handleUpload = (e) => {
    const files = Array.from(e.target.files || [])
    const bins = files.filter((f) => f.name.toLowerCase().endsWith('.bin'))
    if (bins.length > 0) {
      addFiles('root', bins)
      const item = {
        id: `local-${Date.now()}`,
        name: bins[0].name,
        type: 'file',
        file: bins[0],
        blobUrl: URL.createObjectURL(bins[0]),
      }
      setLocalFile(item)
      if (selectedFile) onClearBin()
    }
    e.target.value = ''
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.dataTransfer.files || [])
    const bins = files.filter((f) => f.name.toLowerCase().endsWith('.bin'))
    if (bins.length > 0) {
      addFiles('root', bins)
      const item = {
        id: `local-${Date.now()}`,
        name: bins[0].name,
        type: 'file',
        file: bins[0],
        blobUrl: URL.createObjectURL(bins[0]),
      }
      setLocalFile(item)
      if (selectedFile) onClearBin()
    }
  }

  const activeFile = selectedFile || localFile

  const handleRebuild = async () => {
    if (!activeFile) return
    setRebuilding(true)
    setProgress(0)

    try {
      const formData = new FormData()
      let blob
      if (activeFile.file) {
        blob = activeFile.file
      } else if (activeFile.blobUrl) {
        const resp = await fetch(activeFile.blobUrl)
        blob = await resp.blob()
      } else {
        throw new Error('No source data')
      }
      formData.append('bin', blob, activeFile.name)

      setProgress(30)
      const resp = await fetch(`${API_BASE}/rebuild`, { method: 'POST', body: formData })
      if (!resp.ok) throw new Error(`Rebuild failed: ${resp.status}`)

      setProgress(70)
      const resultBlob = await resp.blob()
      const resultName = activeFile.name.replace(/\.bin$/i, '_reconstructed.png')

      const rebuildDirId = getRebuildDir()
      const resultFile = new File([resultBlob], resultName, { type: 'image/png' })
      addFiles(rebuildDirId, [resultFile])

      setProgress(100)

      const previewItem = {
        id: `rebuild-result-${Date.now()}`,
        name: resultName,
        type: 'image',
        blobUrl: URL.createObjectURL(resultBlob),
        file: resultFile,
      }
      onPreview(previewItem)

      await sleep(300)
    } catch (err) {
      console.error('Rebuild error:', err)
      alert(`Rebuild failed: ${err.message}`)
    }

    setRebuilding(false)
    setProgress(0)
  }

  const panelContent = (
    <div className="panel-body">
      <div className="section">
        <h3 className="section-title">Bitstream Source</h3>
        <div className="file-list">
          <div
            className="file-list-dropzone"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="dropzone-icon">📥</span>
            <span className="dropzone-text">
              Click or drag .bin files here
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".bin"
            multiple
            onChange={handleUpload}
            style={{ display: 'none' }}
          />

          {activeFile && (
            <div className="file-item selected">
              <span className="file-icon">📦</span>
              <span className="file-name">{activeFile.name}</span>
              <span className="file-badge">
                {formatSize(activeFile.file?.size)}
              </span>
              {localFile && <span className="file-badge" style={{ color: '#654ea3' }}>local</span>}
            </div>
          )}

          {!activeFile && (
            <p className="empty-hint">
              Click a .bin file in the workspace, or upload one here
            </p>
          )}
        </div>
      </div>

      <div className="section">
        <button
          className="btn btn-primary"
          onClick={handleRebuild}
          disabled={rebuilding || !activeFile}
        >
          {rebuilding ? `Rebuilding… ${progress}%` : 'Rebuild'}
        </button>
        {rebuilding && (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="section">
        <h3 className="section-title">Rebuild History</h3>
        <div className="result-list">
          <p className="empty-hint">
            Results saved to Workspace &gt; RebuildResult folder
          </p>
        </div>
      </div>
    </div>
  )

  if (compact) {
    return (
      <div className="panel panel-compact">
        {panelContent}
      </div>
    )
  }

  return (
    <div className="panel">
      {panelContent}
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
