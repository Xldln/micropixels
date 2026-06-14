import { useState, useCallback, useRef, useEffect } from 'react'
import { FileProvider, useFiles } from './context/FileContext'
import SplashScreen from './components/SplashScreen'
import Sidebar from './components/Sidebar'
import CompressPanel from './components/CompressPanel'
import RebuildPanel from './components/RebuildPanel'
import ImagePreview from './components/ImagePreview'
import './App.css'

function AppInner() {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('compress')
  const [selectedImage, setSelectedImage] = useState(null)
  const [selectedRebuildBinId, setSelectedRebuildBinId] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(340)
  const resizing = useRef(false)
  const { getItem, getSiblingImages } = useFiles()

  const imageItem = selectedImage ? getItem(selectedImage.id) : null
  const siblings = selectedImage ? getSiblingImages(selectedImage.id) : []
  const hasPreview = imageItem && imageItem.type === 'image'

  const handlePrevNext = useCallback((item) => {
    const fresh = getItem(item.id)
    if (fresh) setSelectedImage(fresh)
  }, [getItem])

  const handleSplashDone = useCallback(() => setLoading(false), [])

  const handleSelectBin = useCallback((item) => {
    setSelectedRebuildBinId(item.id)
    setSelectedImage(null)
    setActiveTab('rebuild')
  }, [])

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    resizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMove = (e) => {
      if (!resizing.current) return
      const w = Math.max(240, Math.min(600, e.clientX))
      setSidebarWidth(w)
    }
    const handleUp = () => {
      if (resizing.current) {
        resizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [])

  return (
    <>
      {loading && <SplashScreen onDone={handleSplashDone} />}
      <div className="app" style={{ visibility: loading ? 'hidden' : 'visible' }}>
        <Sidebar
          onSelectImage={setSelectedImage}
          onSelectBin={handleSelectBin}
          selectedRebuildBinId={selectedRebuildBinId}
          selectedImageId={selectedImage?.id}
          width={sidebarWidth}
        />
        <div className="resize-handle" onMouseDown={handleResizeStart} />
        <main className="main">
          <div className="main-header">
            <div className="brand">
              <span className="brand-dot" />
              <span className="brand-name">micropixels</span>
            </div>
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'compress' ? 'active' : ''}`}
                onClick={() => setActiveTab('compress')}
              >
                Compress
              </button>
              <button
                className={`tab ${activeTab === 'rebuild' ? 'active' : ''}`}
                onClick={() => setActiveTab('rebuild')}
              >
                Rebuild
              </button>
            </div>
          </div>
          <div className="main-content">
            {hasPreview ? (
              <div className="content-with-preview">
                <ImagePreview
                  image={imageItem}
                  siblings={siblings}
                  onNavigate={handlePrevNext}
                  onClose={() => setSelectedImage(null)}
                />
                {activeTab === 'compress' ? (
                  <CompressPanel
                    selectedFile={imageItem}
                    onSelectFile={setSelectedImage}
                    compact
                  />
                ) : (
                  <RebuildPanel
                    compact
                    selectedBinId={selectedRebuildBinId}
                    sidebarFile={imageItem && imageItem.type !== 'image' ? imageItem : null}
                    onClearBin={() => { setSelectedRebuildBinId(null); setSelectedImage(null) }}
                    onPreview={setSelectedImage}
                  />
                )}
              </div>
            ) : (
              activeTab === 'compress' ? (
                <CompressPanel
                  selectedFile={imageItem}
                  onSelectFile={setSelectedImage}
                />
              ) : (
                <RebuildPanel
                  selectedBinId={selectedRebuildBinId}
                  sidebarFile={imageItem && imageItem.type !== 'image' ? imageItem : null}
                  onClearBin={() => { setSelectedRebuildBinId(null); setSelectedImage(null) }}
                  onPreview={setSelectedImage}
                />
              )
            )}
          </div>
        </main>
      </div>
    </>
  )
}

export default function App() {
  return (
    <FileProvider>
      <AppInner />
    </FileProvider>
  )
}
