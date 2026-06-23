import { useState, useEffect, useRef, useCallback } from 'react'
import './LogPanel.css'
import API_BASE from '../config'

function getLevelClass(line) {
  const lower = line.toLowerCase()
  if (lower.includes('| error') || lower.includes('| critical')) return 'log-error'
  if (lower.includes('| warning')) return 'log-warn'
  if (lower.includes('| debug')) return 'log-debug'
  if (lower.includes('| info')) return 'log-info'
  return ''
}

export default function LogPanel() {
  const [lines, setLines] = useState([])
  const [paused, setPaused] = useState(false)
  const offsetRef = useRef(0)
  const bottomRef = useRef(null)
  const containerRef = useRef(null)

  // ── progress polling ────────────────────────────────────────────────
  const [taskId, setTaskId] = useState('')
  const [taskProgress, setTaskProgress] = useState(null)
  const pollRef = useRef(null)

  const fetchProgress = useCallback(async (tid) => {
    try {
      const res = await fetch(`${API_BASE}/progress/${tid}`)
      if (!res.ok) {
        if (res.status === 404) {
          setTaskProgress((p) => p ? { ...p, status: 'unknown' } : null)
        }
        return
      }
      const data = await res.json()
      setTaskProgress(data)
      if (data.status === 'done' || data.status === 'failed') {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    } catch {
      // backend not running
    }
  }, [])

  const startPolling = useCallback((tid) => {
    setTaskId(tid)
    setTaskProgress(null)
    if (pollRef.current) clearInterval(pollRef.current)
    fetchProgress(tid)
    pollRef.current = setInterval(() => fetchProgress(tid), 1500)
  }, [fetchProgress])

  const handlePoll = () => {
    const tid = taskId.trim()
    if (tid) startPolling(tid)
  }

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setTaskProgress(null)
  }

  // Listen for external task-start events from CompressPanel / RebuildPanel
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.taskId) startPolling(e.detail.taskId)
    }
    window.addEventListener('micropixels:task', handler)
    return () => window.removeEventListener('micropixels:task', handler)
  }, [startPolling])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // ── logs ─────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/logs?offset=${offsetRef.current}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.lines && data.lines.length > 0) {
        setLines((prev) => [...prev, ...data.lines].slice(-300))
        offsetRef.current = data.offset
      }
    } catch {
      // backend may not be running; silently ignore
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (!paused) fetchLogs()
    }, 2000)
    fetchLogs()
    return () => clearInterval(interval)
  }, [fetchLogs, paused])

  useEffect(() => {
    if (!paused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, paused])

  const handleClear = () => {
    setLines([])
    offsetRef.current = 0
  }

  const pct = taskProgress?.percent ?? 0

  return (
    <div className="log-panel">
      {/* ── progress box ──────────────────────────────────────────── */}
      <div className="progress-box">
        <div className="progress-box-header">
          <span className="progress-box-title">Task Progress</span>
          {taskProgress && (
            <span className={`progress-box-status ${taskProgress.status}`}>
              {taskProgress.status}
            </span>
          )}
        </div>
        <div className="progress-box-body">
          <div className="progress-box-row">
            <input
              className="progress-box-input"
              placeholder="task_id"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePoll()}
            />
            <button className="log-btn" onClick={handlePoll} title="Poll progress">
              ▶
            </button>
            {taskProgress && (
              <button className="log-btn" onClick={stopPolling} title="Stop">
                ⏹
              </button>
            )}
          </div>

          {taskProgress && (
            <div className="progress-box-info">
              <span className="progress-box-id">ID: {taskProgress.task_id}</span>
              <span className="progress-box-count">
                {taskProgress.completed} / {taskProgress.total}
              </span>
              <span className="progress-box-pct">{pct}%</span>
            </div>
          )}

          <div className="progress-box-bar">
            <div
              className="progress-box-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── logs ──────────────────────────────────────────────────── */}
      <div className="log-header">
        <span className="log-title">Logs</span>
        <div className="log-header-actions">
          <button
            className={`log-btn ${paused ? 'log-btn-active' : ''}`}
            onClick={() => setPaused(!paused)}
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused ? '▶' : '⏸'}
          </button>
          <button className="log-btn" onClick={handleClear} title="Clear">
            ✕
          </button>
        </div>
      </div>
      <div className="log-body" ref={containerRef}>
        {lines.length === 0 ? (
          <div className="log-empty">Waiting for logs…</div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`log-line ${getLevelClass(line)}`}>
              <span className="log-num">{String(i + 1).padStart(3, ' ')}</span>
              <span className="log-text">{line}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
