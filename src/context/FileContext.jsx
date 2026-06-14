import { createContext, useContext, useReducer, useCallback } from 'react'

const FileContext = createContext(null)

let nextId = 1

const initialState = {
  root: { id: 'root', name: 'Workspace', type: 'folder', children: [] },
  items: { root: { id: 'root', name: 'Workspace', type: 'folder', children: [] } },
}

function reducer(state, action) {
  switch (action.type) {
    case 'CREATE_FOLDER': {
      const id = `folder-${nextId++}`
      const folder = { id, name: action.name, type: 'folder', children: [] }
      const parent = { ...state.items[action.parentId] }
      parent.children = [...parent.children, id]
      return {
        ...state,
        items: { ...state.items, [id]: folder, [action.parentId]: parent },
      }
    }
    case 'ADD_FILE': {
      const newItems = { ...state.items }
      action.files.forEach((file) => {
        const id = `file-${nextId++}`
        newItems[id] = {
          id,
          name: file.name,
          type: file.type.startsWith('image/') ? 'image' : 'file',
          file,
          blobUrl: URL.createObjectURL(file),
        }
        const parent = { ...newItems[action.parentId] }
        parent.children = [...parent.children, id]
        newItems[action.parentId] = parent
      })
      return { ...state, items: newItems }
    }
    case 'DELETE_ITEM': {
      const item = state.items[action.id]
      if (!item) return state
      const newItems = { ...state.items }

      const removeRecursive = (id) => {
        const node = newItems[id]
        if (!node) return
        if (node.blobUrl) URL.revokeObjectURL(node.blobUrl)
        if (node.children) node.children.forEach(removeRecursive)
        delete newItems[id]
      }

      if (action.parentId) {
        const parent = { ...newItems[action.parentId] }
        parent.children = parent.children.filter((c) => c !== action.id)
        newItems[action.parentId] = parent
      }

      removeRecursive(action.id)
      return { ...state, items: newItems }
    }
    case 'ADD_RESULT': {
      const id = `result-${nextId++}`
      const result = {
        id,
        name: action.name,
        type: action.fileType || 'file',
        blobUrl: URL.createObjectURL(action.blob),
        blob: action.blob,
        category: action.category,
      }
      return {
        ...state,
        items: { ...state.items, [id]: result },
      }
    }
    case 'REMOVE_RESULT': {
      const item = state.items[action.id]
      const newItems = { ...state.items }
      if (item?.blobUrl) URL.revokeObjectURL(item.blobUrl)
      delete newItems[action.id]
      return { ...state, items: newItems }
    }
    case 'MOVE_ITEM': {
      const { itemId, fromParentId, toParentId } = action
      const newItems = { ...state.items }
      if (fromParentId) {
        const fromParent = { ...newItems[fromParentId] }
        fromParent.children = fromParent.children.filter((c) => c !== itemId)
        newItems[fromParentId] = fromParent
      }
      const toParent = { ...newItems[toParentId] }
      toParent.children = [...toParent.children, itemId]
      newItems[toParentId] = toParent
      return { ...state, items: newItems }
    }
    default:
      return state
  }
}

export function FileProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const createFolder = useCallback((parentId, name) => {
    dispatch({ type: 'CREATE_FOLDER', parentId, name })
  }, [])

  const addFiles = useCallback((parentId, files) => {
    dispatch({ type: 'ADD_FILE', parentId, files })
  }, [])

  const deleteItem = useCallback((id, parentId) => {
    dispatch({ type: 'DELETE_ITEM', id, parentId })
  }, [])

  const addResult = useCallback((name, blob, fileType, category) => {
    dispatch({ type: 'ADD_RESULT', name, blob, fileType, category })
  }, [])

  const removeResult = useCallback((id) => {
    dispatch({ type: 'REMOVE_RESULT', id })
  }, [])

  const moveItem = useCallback((itemId, fromParentId, toParentId) => {
    if (itemId === toParentId) return
    dispatch({ type: 'MOVE_ITEM', itemId, fromParentId, toParentId })
  }, [])

  const getItem = useCallback(
    (id) => state.items[id],
    [state.items],
  )

  const getChildren = useCallback(
    (id) => {
      const item = state.items[id]
      if (!item?.children) return []
      return item.children.map((cid) => state.items[cid]).filter(Boolean)
    },
    [state.items],
  )

  const getResults = useCallback(
    (category) => {
      return Object.values(state.items).filter(
        (item) => item.category === category && item.blobUrl,
      )
    },
    [state.items],
  )

  const findParentId = useCallback(
    (childId) => {
      for (const [id, item] of Object.entries(state.items)) {
        if (item.children?.includes(childId)) return id
      }
      return null
    },
    [state.items],
  )

  const getSiblingImages = useCallback(
    (itemId) => {
      const parentId = findParentId(itemId)
      if (!parentId) return []
      const parent = state.items[parentId]
      if (!parent?.children) return []
      return parent.children
        .map((cid) => state.items[cid])
        .filter((item) => item && item.type === 'image')
    },
    [state.items, findParentId],
  )

  return (
    <FileContext.Provider
      value={{
        root: state.items.root,
        createFolder,
        addFiles,
        deleteItem,
        addResult,
        removeResult,
        moveItem,
        getItem,
        getChildren,
        getResults,
        findParentId,
        getSiblingImages,
      }}
    >
      {children}
    </FileContext.Provider>
  )
}

export function useFiles() {
  const ctx = useContext(FileContext)
  if (!ctx) throw new Error('useFiles must be used within FileProvider')
  return ctx
}
