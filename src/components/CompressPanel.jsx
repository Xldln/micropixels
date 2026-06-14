import { useState, useRef, useCallback } from 'react'
import { useFiles } from '../context/FileContext'
import './CompressPanel.css'

const API_BASE = 'http://localhost:9000/micropixels'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp'])
const ACCEPTED_EXTS = new Set([...IMAGE_EXTS, '.zip', '.bin'])
const INPUT_ACCEPT = '.png,.jpg,.jpeg,.bmp,.tiff,.tif,.webp,.zip,.bin'

function fileTypeFromName(name) {
  const ext = '.' + name.split('.').pop().toLowerCase()
  if (ext === '.bin') return 'bin'
  if (ext === '.zip') return 'zip'
  if (IMAGE_EXTS.has(ext)) return 'image'
  return 'file'
}

const TOOLS = [
  'ChromaShift', 'DependentRegions', 'ECThread8',
  'EFElinear', 'EFEnonlinear', 'EnhancementFilters',
  'ICCI', 'IndependentRegions', 'LEF', 'LSBS',
  'RDLR', 'ResVarScale', 'eICCI', 'quality_map',
]

const PROFILES = ['simple', 'base', 'high']

export default function CompressPanel({ selectedFile, onSelectFile, compact }) {
  const { root, getItem, getChildren, addFiles, getCompressDir } = useFiles()
  const fileInputRef = useRef(null)
  const [bppIdx, setBppIdx] = useState(2)
  const [maxWorkers, setMaxWorkers] = useState(5)
  const [poolInitResult, setPoolInitResult] = useState(null)
  const [poolIniting, setPoolIniting] = useState(false)
  const [localFile, setLocalFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const BPP_VALUES = [12, 25, 50, 75, 100]
  const BPP_LABELS = ['lowest', 'low', 'medium', 'high', 'highest']
  const [compressing, setCompressing] = useState(false)
  const [progress, setProgress] = useState(0)
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
        if (child.type !== 'folder' && child.file) {
          files.push(child)
        } else if (child.type === 'folder') {
          walk(child.id)
        }
      })
    }
    walk(root.id)
    return files
  }, [root.id, getChildren])

  const handleUpload = (e) => {
    const files = Array.from(e.target.files || [])
    const accepted = files.filter((f) => {
      const ext = '.' + f.name.split('.').pop().toLowerCase()
      return ACCEPTED_EXTS.has(ext)
    })
    if (accepted.length > 0) {
      const f = accepted[0]
      addFiles('root', [f])
      setLocalFile({
        id: `local-${Date.now()}`,
        name: f.name,
        type: fileTypeFromName(f.name),
        file: f,
        blobUrl: URL.createObjectURL(f),
      })
      onSelectFile(null)
    }
    e.target.value = ''
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files || [])
    const accepted = dropped.filter((f) => {
      const ext = '.' + f.name.split('.').pop().toLowerCase()
      return ACCEPTED_EXTS.has(ext)
    })
    if (accepted.length > 0) {
      const f = accepted[0]
      addFiles('root', [f])
      setLocalFile({
        id: `local-${Date.now()}`,
        name: f.name,
        type: fileTypeFromName(f.name),
        file: f,
        blobUrl: URL.createObjectURL(f),
      })
      onSelectFile(null)
    }
  }

  const handlePoolInit = async () => {
    setPoolIniting(true)
    setPoolInitResult(null)
    try {
      const formData = new FormData()
      formData.append('max_workers', String(maxWorkers))
      const cfgParts = _buildCfgParts()
      if (cfgParts.length) formData.append('cfg', cfgParts.join(';'))

      const resp = await fetch(`${API_BASE}/pool/init`, { method: 'POST', body: formData })
      const data = await resp.json()
      setPoolInitResult(data)
    } catch (err) {
      setPoolInitResult({ success: false, errors: [err.message] })
    }
    setPoolIniting(false)
  }

  const _buildCfgParts = () => {
    const parts = []
    parts.push(toolsMode === 'all' ? 'cfg/tools_on.json' : 'cfg/tools_off.json')
    if (toolsMode === 'custom') {
      selectedTools.forEach((t) => parts.push(`cfg/tools/${t}.json`))
    }
    parts.push(`cfg/profiles/${profile}.json`)
    return parts
  }

  const handleCompress = async () => {
    const file = localFile || selectedFile
    if (!file) return

    const cfgParts = _buildCfgParts()
    const cfgStr = cfgParts.join(';')
    const isZip = file.name?.toLowerCase().endsWith('.zip')

    setCompressing(true)
    setProgress(0)

    try {
      const formData = new FormData()
      let blob
      if (file.file) {
        blob = file.file
      } else if (file.blobUrl) {
        const r = await fetch(file.blobUrl)
        blob = await r.blob()
      }
      if (!blob) return

      formData.append(isZip ? 'file' : 'image', blob, file.name)
      formData.append('bpp_idx', String(bppIdx))
      if (cfgStr) formData.append('cfg', cfgStr)

      const endpoint = isZip ? 'compress_zip' : 'compress'
      const taskId = isZip ? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` : ''
      if (isZip) {
        formData.append('task_id', taskId)
        formData.append('max_workers', String(maxWorkers))
        window.dispatchEvent(new CustomEvent('micropixels:task', { detail: { taskId } }))
      }

      setProgress(isZip ? 5 : 30)
      const resp = await fetch(`${API_BASE}/${endpoint}`, { method: 'POST', body: formData })
      if (!resp.ok) throw new Error(`Compress failed: ${resp.status}`)

      setProgress(isZip ? 100 : 70)
      const resultBlob = await resp.blob()
      const isZipOut = isZip || resp.headers.get('content-type')?.includes('zip')

      if (isZipOut) {
        const resultName = file.name.replace(/\.\w+$/i, '_compressed.zip')
        const resultFile = new File([resultBlob], resultName, { type: 'application/zip' })
        addFiles(getCompressDir(), [resultFile])
      } else {
        const binBlob = resultBlob
        const binName = file.name.replace(/\.\w+$/, '.bin')
        const binFile = new File([binBlob], binName, { type: 'application/octet-stream' })
        addFiles(getCompressDir(), [binFile])
      }
      setProgress(100)
      await sleep(300)
    } catch (err) {
      console.error(`Compress failed:`, err)
      alert(`Compress failed: ${err.message}`)
    }

    setCompressing(false)
    setProgress(0)
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

      <div className="cfg-group">
        <label className="cfg-label">Pool Workers</label>
        <div className="cfg-pool-row">
          <input
            type="number"
            className="cfg-pool-input"
            min={1}
            max={20}
            value={maxWorkers}
            onChange={(e) => setMaxWorkers(Number(e.target.value))}
          />
          <button
            className="btn btn-sm cfg-pool-btn"
            onClick={handlePoolInit}
            disabled={poolIniting}
          >
            {poolIniting ? 'Initing…' : 'Init Pool'}
          </button>
        </div>
        {poolInitResult && (
          <p className={poolInitResult.success ? 'pool-msg-ok' : 'pool-msg-err'}>
            {poolInitResult.success
              ? `✓ ${poolInitResult.workers_ready}/${poolInitResult.workers_requested} workers ready (${poolInitResult.warmup_seconds}s)`
              : `✗ ${poolInitResult.errors?.[0] || 'failed'}`}
          </p>
        )}
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
              <label>BPP: {BPP_VALUES[bppIdx]} ({BPP_LABELS[bppIdx]})</label>
              <input
                type="range"
                min={0}
                max={BPP_VALUES.length - 1}
                value={bppIdx}
                onChange={(e) => setBppIdx(Number(e.target.value))}
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
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-body">
        <div className="section">
          <h3 className="section-title">Source File</h3>
          <div className="file-list">
            <div
              className={`file-list-dropzone ${dragOver ? 'dropzone-active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="dropzone-icon">📥</span>
              <span className="dropzone-text">
                Click or drag a file here
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={INPUT_ACCEPT}
              style={{ display: 'none' }}
              onChange={handleUpload}
            />

            {localFile && (
              <div className="file-item selected" style={{ borderLeft: '3px solid #654ea3' }}>
                <span className="file-icon">📤</span>
                <span className="file-name">{localFile.name}</span>
                <span className="file-badge">{formatSize(localFile.file?.size)}</span>
                <button
                  className="btn btn-sm"
                  onClick={(e) => { e.stopPropagation(); setLocalFile(null) }}
                  style={{ marginLeft: 'auto' }}
                >
                  ✕
                </button>
              </div>
            )}

            {!localFile && !selectedFile && (
              <p className="empty-hint">
                Upload a file or click one from the workspace below
              </p>
            )}

            {selectedFile && !localFile && (
              <div className="file-item selected">
                <span className="file-icon">
                  {selectedFile.type === 'image' ? '🖼️' : selectedFile.type === 'zip' ? '📦' : '📄'}
                </span>
                <span className="file-name">{selectedFile.name}</span>
                <span className="file-badge">{formatSize(selectedFile.file?.size)}</span>
              </div>
            )}
          </div>

          <h3 className="section-title" style={{ marginTop: 16 }}>Workspace</h3>
          <div className="file-list">
            {fileList.length === 0 ? (
              <p className="empty-hint">No files yet</p>
            ) : (
              fileList.map((f) => (
                <div
                  key={f.id}
                  className={`file-item ${selectedFile?.id === f.id && !localFile ? 'selected' : ''}`}
                  onClick={() => {
                    setLocalFile(null)
                    onSelectFile(selectedFile?.id === f.id ? null : f)
                  }}
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
            <label>BPP: {BPP_VALUES[bppIdx]} ({BPP_LABELS[bppIdx]})</label>
            <input
              type="range"
              min={0}
              max={BPP_VALUES.length - 1}
              value={bppIdx}
              onChange={(e) => setBppIdx(Number(e.target.value))}
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
