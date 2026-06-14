import { useState, useRef, useEffect } from 'react'
import { useFiles } from '../context/FileContext'
import './CompressPanel.css'

const API_BASE = 'http://localhost:9000/micropixels'

const ACCEPT_EXTS = new Set(['.bin', '.zip', '.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp'])
const INPUT_ACCEPT = '.bin,.zip,.png,.jpg,.jpeg,.bmp,.tiff,.tif,.webp'

function fileTypeFromName(name) {
  const ext = '.' + name.split('.').pop().toLowerCase()
  if (ext === '.bin') return 'bin'
  if (ext === '.zip') return 'zip'
  if (['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp'].includes(ext)) return 'image'
  return 'file'
}

export default function RebuildPanel({ compact, selectedBinId, onPreview, onClearBin, sidebarFile }) {
  const { getItem, addFiles, getRebuildDir } = useFiles()
  const selectedBinFile = selectedBinId ? getItem(selectedBinId) : null
  const [rebuilding, setRebuilding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [localFile, setLocalFile] = useState(null)
  const fileInputRef = useRef(null)

  const workspaceFile = sidebarFile || selectedBinFile

  useEffect(() => {
    if (workspaceFile) setLocalFile(null)
  }, [workspaceFile])

  const handleUpload = (e) => {
    const files = Array.from(e.target.files || [])
    const accepted = files.filter((f) => {
      const ext = '.' + f.name.split('.').pop().toLowerCase()
      return ACCEPT_EXTS.has(ext)
    })
    if (accepted.length > 0) {
      addFiles('root', accepted)
      const item = {
        id: `local-${Date.now()}`,
        name: accepted[0].name,
        type: fileTypeFromName(accepted[0].name),
        file: accepted[0],
        blobUrl: URL.createObjectURL(accepted[0]),
      }
      setLocalFile(item)
      if (workspaceFile) onClearBin()
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
    const dropped = Array.from(e.dataTransfer.files || [])
    const accepted = dropped.filter((f) => {
      const ext = '.' + f.name.split('.').pop().toLowerCase()
      return ACCEPT_EXTS.has(ext)
    })
    if (accepted.length > 0) {
      addFiles('root', accepted)
      const item = {
        id: `local-${Date.now()}`,
        name: accepted[0].name,
        type: fileTypeFromName(accepted[0].name),
        file: accepted[0],
        blobUrl: URL.createObjectURL(accepted[0]),
      }
      setLocalFile(item)
      if (workspaceFile) onClearBin()
    }
  }

  const activeFile = localFile || workspaceFile

  const handleRebuild = async () => {
    if (!activeFile) return
    const isZip = activeFile.name?.toLowerCase().endsWith('.zip')

    setRebuilding(true)
    setProgress(0)

    try {
      const formData = new FormData()
      let blob
      if (activeFile.file) {
        blob = activeFile.file
      } else if (activeFile.blobUrl) {
        const r = await fetch(activeFile.blobUrl)
        blob = await r.blob()
      }
      if (!blob) throw new Error('No source data')

      const endpoint = isZip ? 'rebuild_zip' : 'rebuild'
      formData.append(isZip ? 'file' : 'bin', blob, activeFile.name)
      if (isZip) {
        const tid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
        formData.append('task_id', tid)
        window.dispatchEvent(new CustomEvent('micropixels:task', { detail: { taskId: tid } }))
      }

      setProgress(isZip ? 5 : 30)
      const url = `${API_BASE}/${endpoint}`
      const resp = await fetch(url, { method: 'POST', body: formData })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`Rebuild failed: ${resp.status} ${text}`)
      }

      const resultBlob = await resp.blob()
      const isZipOut = isZip || (resp.headers.get('content-type') || '').includes('zip')

      const resultName = isZipOut
        ? activeFile.name.replace(/\.\w+$/i, '_reconstructed.zip')
        : activeFile.name.replace(/\.bin$/i, '_reconstructed.png')

      const resultFile = new File(
        [resultBlob],
        resultName,
        { type: isZipOut ? 'application/zip' : 'image/png' },
      )
      addFiles(getRebuildDir(), [resultFile])

      if (!isZipOut) {
        onPreview({
          id: `rebuild-result-${Date.now()}`,
          name: resultName,
          type: 'image',
          blobUrl: URL.createObjectURL(resultBlob),
          file: resultFile,
        })
      }
      setProgress(100)
      await sleep(300)
    } catch (err) {
      console.error('[rebuild] error:', err)
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
              Click or drag .zip / .bin / images here
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={INPUT_ACCEPT}
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
