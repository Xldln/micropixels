import { useState, useRef } from 'react'
import { useFiles } from '../context/FileContext'
import LogPanel from './LogPanel'
import './Sidebar.css'

const ACCEPT_TYPES = 'image/*,.zip,.tar,.gz,.7z,.rar'

function TreeNode({
  itemId,
  depth = 0,
  parentId = null,
  onSelectImage,
  selectedImageId,
}) {
  const { getItem, getChildren, createFolder, addFiles, deleteItem, moveItem } =
    useFiles()
  const [expanded, setExpanded] = useState(depth < 1)
  const [newFolder, setNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [dragSrc, setDragSrc] = useState(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  const item = getItem(itemId)
  if (!item) return null
  const children = getChildren(itemId)
  const isFolder = item.type === 'folder'
  const isImage = item.type === 'image'

  const handleToggle = () => isFolder && setExpanded(!expanded)

  const handleClick = () => {
    if (isImage) {
      onSelectImage(item)
    } else if (isFolder) {
      setExpanded(!expanded)
    }
  }

  const handleUpload = (e) => {
    const files = Array.from(e.target.files)
    if (files.length) {
      processDroppedFiles(files)
    }
    e.target.value = ''
  }

  const processDroppedFiles = (files) => {
    const validFiles = files.filter(
      (f) =>
        f.type.startsWith('image/') ||
        /\.(zip|tar|gz|7z|rar)$/i.test(f.name),
    )
    if (validFiles.length) {
      addFiles(itemId, validFiles)
    }
  }

  const startNewFolder = () => {
    setNewFolder(true)
    setFolderName('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const confirmNewFolder = () => {
    if (folderName.trim()) {
      createFolder(itemId, folderName.trim())
    }
    setNewFolder(false)
    setFolderName('')
  }

  const onDragStart = (e) => {
    e.stopPropagation()
    setDragSrc(itemId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify({ itemId, parentId }))
  }

  const onDragOver = (e) => {
    if (!isFolder) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  const onDragLeave = (e) => {
    e.stopPropagation()
    setDragOver(false)
  }

  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      processDroppedFiles(Array.from(files))
      return
    }

    try {
      const raw = e.dataTransfer.getData('text/plain')
      const data = JSON.parse(raw)
      if (data.itemId && data.itemId !== itemId) {
        moveItem(data.itemId, data.parentId, itemId)
      }
    } catch {
    }
    setDragSrc(null)
  }

  const getIcon = () => {
    if (isFolder) return expanded ? '📂' : '📁'
    if (isImage) return '🖼️'
    return '📄'
  }

  return (
    <div className="tree-node">
      <div
        className={`tree-row ${item.type} ${dragOver ? 'drag-over' : ''} ${
          selectedImageId === itemId ? 'selected' : ''
        }`}
        style={{ paddingLeft: depth * 16 + 8 }}
        draggable={itemId !== 'root'}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={handleClick}
      >
        <span className="tree-toggle" onClick={handleToggle}>
          {isFolder ? (expanded ? '▾' : '▸') : '  '}
        </span>
        <span className="tree-icon">{getIcon()}</span>
        <span className="tree-name" title={item.name}>
          {item.name}
        </span>
        <span className="tree-actions">
          {isFolder && (
            <>
              <button
                className="tree-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  startNewFolder()
                }}
                title="New folder"
              >
                +
              </button>
              <button
                className="tree-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
                title="Upload"
              >
                ↑
              </button>
            </>
          )}
          {itemId !== 'root' && (
            <button
              className="tree-btn tree-btn-del"
              onClick={(e) => {
                e.stopPropagation()
                deleteItem(itemId, parentId)
                if (selectedImageId === itemId) onSelectImage(null)
              }}
              title="Delete"
            >
              ×
            </button>
          )}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_TYPES}
          onChange={handleUpload}
          style={{ display: 'none' }}
        />
      </div>
      {newFolder && (
        <div
          className="tree-row"
          style={{ paddingLeft: (depth + 1) * 16 + 8 }}
        >
          <input
            ref={inputRef}
            className="tree-input"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmNewFolder()
              if (e.key === 'Escape') setNewFolder(false)
            }}
            onBlur={confirmNewFolder}
            placeholder="folder name"
          />
        </div>
      )}
      {isFolder && expanded && (
        <div className="tree-children">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              itemId={child.id}
              depth={depth + 1}
              parentId={itemId}
              onSelectImage={onSelectImage}
              selectedImageId={selectedImageId}
            />
          ))}
          {children.length === 0 && !newFolder && (
            <div
              className="tree-empty"
              style={{ paddingLeft: (depth + 1) * 16 + 28 }}
            >
              Drop files here
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ onSelectImage, selectedImageId, width }) {
  const { root, addFiles } = useFiles()
  const [dragOverRoot, setDragOverRoot] = useState(false)

  const handleRootDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverRoot(true)
  }

  const handleRootDragLeave = (e) => {
    e.stopPropagation()
    setDragOverRoot(false)
  }

  const handleRootDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverRoot(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const validFiles = Array.from(files).filter(
        (f) =>
          f.type.startsWith('image/') ||
          /\.(zip|tar|gz|7z|rar)$/i.test(f.name),
      )
      if (validFiles.length) {
        addFiles(root.id, validFiles)
      }
    }
  }

  return (
    <aside
      className={`sidebar ${dragOverRoot ? 'sidebar-drag-over' : ''}`}
      style={{ width, minWidth: width, maxWidth: width }}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
    >
      <div className="sidebar-header">
        <h2>Workspace</h2>
      </div>
      <div className="sidebar-tree">
        <TreeNode
          itemId={root.id}
          parentId={null}
          onSelectImage={onSelectImage}
          selectedImageId={selectedImageId}
        />
      </div>
      <LogPanel />
    </aside>
  )
}
