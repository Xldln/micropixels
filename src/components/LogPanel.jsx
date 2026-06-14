import { useState, useEffect, useRef, useCallback } from 'react'
import './LogPanel.css'

const API_BASE = 'http://localhost:9000/micropixels'

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

  return (
    <div className="log-panel">
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
