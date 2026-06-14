import { useMemo, useState, useEffect } from 'react'
import './ImagePreview.css'

export default function ImagePreview({ image, siblings, onNavigate, onClose }) {
  const [dimensions, setDimensions] = useState(null)

  const src = useMemo(
    () => image.blobUrl || (image.file ? URL.createObjectURL(image.file) : null),
    [image],
  )

  useEffect(() => {
    if (!src) return
    setDimensions(null)
    const img = new Image()
    img.onload = () => setDimensions({ width: img.naturalWidth, height: img.naturalHeight })
    img.src = src
  }, [src])

  if (!image || !src) return null

  const { currentIndex, hasPrev, hasNext } = useMemo(() => {
    const idx = siblings.findIndex((s) => s.id === image.id)
    return {
      currentIndex: idx,
      hasPrev: idx > 0,
      hasNext: idx >= 0 && idx < siblings.length - 1,
    }
  }, [image.id, siblings])

  const goPrev = () => {
    if (currentIndex > 0) onNavigate(siblings[currentIndex - 1])
  }

  const goNext = () => {
    if (currentIndex < siblings.length - 1) onNavigate(siblings[currentIndex + 1])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') goPrev()
    if (e.key === 'ArrowRight') goNext()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="image-preview-container" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="image-preview-bar">
        <span className="image-preview-counter">
          {siblings.length > 1
            ? `${currentIndex + 1} / ${siblings.length}`
            : ''}
        </span>
        <span className="image-preview-name" title={image.name}>
          {image.name}
        </span>
        {dimensions && (
          <span className="image-preview-resolution">
            {dimensions.width} × {dimensions.height}
          </span>
        )}
        <span className="image-preview-size">{formatSize(image.file?.size)}</span>
        <button className="preview-close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="image-preview-body">
        {hasPrev && (
          <button className="preview-arrow preview-arrow-left" onClick={goPrev}>
            ‹
          </button>
        )}
        <img src={src} alt={image.name} className="image-preview-img" />
        {hasNext && (
          <button className="preview-arrow preview-arrow-right" onClick={goNext}>
            ›
          </button>
        )}
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
