import { useState, useRef, useCallback } from 'react'
import { useFiles } from '../context/FileContext'
import './CompressPanel.css'

const TOOLS = [
  'ChromaShift', 'DependentRegions', 'ECThread8',
  'EFElinear', 'EFEnonlinear', 'EnhancementFilters',
  'ICCI', 'IndependentRegions', 'LEF', 'LSBS',
  'RDLR', 'ResVarScale', 'eICCI', 'quality_map',
]

const PROFILES = ['simple', 'base', 'high']

export default function CompressPanel({ selectedFile, onSelectFile, compact }) {
  const { root, getItem, getChildren, addResult, getResults } = useFiles()
  const [quality, setQuality] = useState(75)
  const [compressing, setCompressing] = useState(false)
  const [progress, setProgress] = useState(0)
  const canvasRef = useRef(null)
  const compressResults = getResults('compress')

  const [profile, setProfile] = useState('base')
  const [toolsMode, setToolsMode] = useState('off')
  const [selectedTools, setSelectedTools] = useState(new Set())

  const toggleTool = (tool) => {
    const next = new Set(selectedTools)
    if (next.has(tool)) next.delete(tool)
    else next.add(tool)
    setSelectedTools(next)
  }

  const getAllFiles = useCallback(() => {
    const files = []
    const walk = (id) => {
      const children = getChildren(id)
      children.forEach((child) => {
        if (child.type === 'image' && child.file) {
          files.push(child)
        } else if (child.type === 'folder') {
          walk(child.id)
        }
      })
    }
    walk(root.id)
    return files
  }, [root.id, getChildren])

  const handleCompress = async () => {
    const files = selectedFile
      ? [selectedFile]
      : getAllFiles()

    if (!files.length) return

    setCompressing(true)
    setProgress(0)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.type !== 'image') continue

      try {
        const blob = await compressImage(file.file || file, quality)
        const name = file.name.replace(/\.\w+$/, `_c.jpg`)
        addResult(name, blob, 'image', 'compress')
      } catch (err) {
        console.error(`Failed to compress ${file.name}:`, err)
      }

      setProgress(Math.round(((i + 1) / files.length) * 100))
      await sleep(50)
    }

    setCompressing(false)
    setProgress(0)
  }

  const handleDownload = (item) => {
    const a = document.createElement('a')
    a.href = item.blobUrl
    a.download = item.name
    a.click()
  }

  const fileList = getAllFiles()

  const CfgSection = () => (
    <div className="cfg-section">
      <h3 className="section-title">Codec Configuration</h3>

      <div className="cfg-group">
        <label className="cfg-label">Profile</label>
        <div className="cfg-segmented">
          {PROFILES.map((p) => (
            <button
              key={p}
              className={`cfg-seg-btn ${profile === p ? 'active' : ''}`}
              onClick={() => setProfile(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="cfg-group">
        <label className="cfg-label">Tools</label>
        <div className="cfg-segmented">
          {[
            { key: 'off', label: 'Off' },
            { key: 'all', label: 'All' },
            { key: 'custom', label: 'Custom' },
          ].map((t) => (
            <button
              key={t.key}
              className={`cfg-seg-btn ${toolsMode === t.key ? 'active' : ''}`}
              onClick={() => setToolsMode(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {toolsMode === 'custom' && (
        <div className="cfg-tools-grid">
          {TOOLS.map((tool) => (
            <label key={tool} className="cfg-tool-chip">
              <input
                type="checkbox"
                checked={selectedTools.has(tool)}
                onChange={() => toggleTool(tool)}
              />
              <span>{tool}</span>
            </label>
          ))}
        </div>
      )}

      <div className="cfg-cli-preview">
        <span className="cfg-cli-label">CLI</span>
        <code className="cfg-cli-code">
          test_files --cfg cfg/tools_{toolsMode === 'all' ? 'on' : 'off'}.json
          {toolsMode === 'custom' && selectedTools.size > 0
            ? Array.from(selectedTools)
                .map((t) => ` cfg/tools/${t}.json`)
                .join('')
            : ''}
          {' '}cfg/profiles/{profile}.json
        </code>
      </div>
    </div>
  )

  if (compact) {
    return (
      <div className="panel panel-compact">
        <div className="panel-body">
          <div className="section">
            <h3 className="section-title">Compress this image</h3>
            <div className="quality-control">
              <label>Quality: {quality}%</label>
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={handleCompress}
              disabled={compressing}
            >
              {compressing ? `Compressing… ${progress}%` : 'Compress'}
            </button>
            {compressing && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>

          <CfgSection />

          <div className="section">
            <h3 className="section-title">
              Compressed Results ({compressResults.length})
            </h3>
            <div className="result-list">
              {compressResults.length === 0 ? (
                <p className="empty-hint">No results yet</p>
              ) : (
                compressResults.map((r) => (
                  <div key={r.id} className="result-item">
                    <span className="file-icon">📦</span>
                    <span className="file-name" title={r.name}>
                      {r.name}
                    </span>
                    <span className="file-badge">
                      {formatSize(r.blob?.size)}
                    </span>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleDownload(r)}
                    >
                      ↓
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-body">
        <div className="section">
          <h3 className="section-title">Source Files</h3>
          <div className="file-list">
            {fileList.length === 0 ? (
              <p className="empty-hint">
                Upload images to the workspace first
              </p>
            ) : (
              fileList.map((f) => (
                <div
                  key={f.id}
                  className={`file-item ${selectedFile?.id === f.id ? 'selected' : ''}`}
                  onClick={() =>
                    onSelectFile(selectedFile?.id === f.id ? null : f)
                  }
                >
                  <span className="file-icon">
                    {f.type === 'image' ? '🖼️' : '📄'}
                  </span>
                  <span className="file-name">{f.name}</span>
                  <span className="file-badge">{formatSize(f.file?.size)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="section">
          <h3 className="section-title">Compression Settings</h3>
          <div className="quality-control">
            <label>Quality: {quality}%</label>
            <input
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleCompress}
            disabled={compressing || fileList.length === 0}
          >
            {compressing ? `Compressing… ${progress}%` : 'Compress'}
          </button>
          {compressing && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        <CfgSection />

        <div className="section">
          <h3 className="section-title">
            Results ({compressResults.length})
          </h3>
          <div className="result-list">
            {compressResults.length === 0 ? (
              <p className="empty-hint">No results yet</p>
            ) : (
              compressResults.map((r) => (
                <div key={r.id} className="result-item">
                  <span className="file-icon">📦</span>
                  <span className="file-name" title={r.name}>
                    {r.name}
                  </span>
                  <span className="file-badge">
                    {formatSize(r.blob?.size)}
                  </span>
                  <button
                    className="btn btn-sm"
                    onClick={() => handleDownload(r)}
                  >
                    ↓
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}

function compressImage(file, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = file instanceof File ? URL.createObjectURL(file) : ''

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Canvas toBlob failed'))
        },
        'image/jpeg',
        quality / 100,
      )
      if (file instanceof File) URL.revokeObjectURL(url)
    }
    img.onerror = reject
    if (file instanceof File) {
      img.src = url
    } else if (file.blobUrl) {
      img.src = file.blobUrl
    } else {
      reject(new Error('No source'))
    }
  })
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
