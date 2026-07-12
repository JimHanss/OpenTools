import { useEffect, useMemo, useState } from 'react'

import {
  createMindMapDocument,
  createMindMapNode,
  type MindMapDocument,
} from '@opentools/mindmap-core'
import { parseMindMapDocument } from '@opentools/mindmap-format'
import { layoutMindMap } from '@opentools/mindmap-layout'
import { createCubicConnectorPath } from '@opentools/mindmap-renderer-svg'
import { DexieMindMapRepository } from '@opentools/mindmap-storage'

import { useEditorUiStore } from './editor/store'

const mapId = 'opentools-welcome-map'

function createStarterDocument(): MindMapDocument {
  const now = new Date().toISOString()
  const document = createMindMapDocument({
    id: mapId,
    rootNodeId: 'root',
    title: 'OpenTools 思维导图',
    now,
  })

  document.nodes.root!.childIds = ['core', 'layout', 'platform']
  document.nodes.core = createMindMapNode({
    id: 'core',
    parentId: 'root',
    text: '领域模型与命令',
  })
  document.nodes.layout = createMindMapNode({
    id: 'layout',
    parentId: 'root',
    text: '从左到右布局',
    style: {
      backgroundColor: '#eefbf6',
      borderColor: '#20a779',
      textColor: '#0d5f46',
    },
  })
  document.nodes.platform = createMindMapNode({
    id: 'platform',
    parentId: 'root',
    text: 'Web / 小程序适配',
    style: {
      backgroundColor: '#fff7e9',
      borderColor: '#df8b23',
      textColor: '#7a4510',
    },
  })

  return document
}

export default function App() {
  const repository = useMemo(() => new DexieMindMapRepository(), [])
  const [document, setDocument] = useState(createStarterDocument)
  const [isHydrated, setIsHydrated] = useState(false)
  const [saveStatus, setSaveStatus] = useState('正在读取本地数据')
  const selectedNodeId = useEditorUiStore((state) => state.selectedNodeId)
  const zoom = useEditorUiStore((state) => state.zoom)
  const selectNode = useEditorUiStore((state) => state.selectNode)
  const setZoom = useEditorUiStore((state) => state.setZoom)
  const layout = useMemo(() => layoutMindMap(document), [document])
  const selectedNode = selectedNodeId
    ? document.nodes[selectedNodeId]
    : document.nodes[document.rootNodeId]

  useEffect(() => {
    let cancelled = false

    repository
      .get(mapId)
      .then((storedDocument) => {
        if (storedDocument && !cancelled) {
          setDocument(parseMindMapDocument(storedDocument))
        }
      })
      .catch(() => {
        if (!cancelled) setSaveStatus('本地存储暂不可用')
      })
      .finally(() => {
        if (!cancelled) {
          setIsHydrated(true)
          setSaveStatus('已就绪')
        }
      })

    return () => {
      cancelled = true
    }
  }, [repository])

  useEffect(() => {
    if (!isHydrated) return

    setSaveStatus('保存中…')
    const timeout = window.setTimeout(() => {
      repository
        .save(document)
        .then(() => setSaveStatus('已自动保存'))
        .catch(() => setSaveStatus('自动保存失败'))
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [document, isHydrated, repository])

  function renameMap(title: string) {
    setDocument((currentDocument) => ({
      ...currentDocument,
      title,
      updatedAt: new Date().toISOString(),
    }))
  }

  const viewWidth = Math.max(920, layout.width * zoom + 160)
  const viewHeight = Math.max(620, layout.height * zoom + 160)

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="OpenTools">
          <span className="brand-mark">O</span>
          <span>OpenTools</span>
        </div>

        <input
          className="map-title"
          aria-label="思维导图标题"
          value={document.title}
          onChange={(event) => renameMap(event.target.value)}
        />

        <span className="save-status" role="status">
          <span className="status-dot" />
          {saveStatus}
        </span>
      </header>

      <section className="workspace">
        <aside className="toolbar" aria-label="编辑工具">
          <button type="button" onClick={() => setZoom(zoom + 0.1)}>
            ＋<span>放大</span>
          </button>
          <button type="button" onClick={() => setZoom(zoom - 0.1)}>
            －<span>缩小</span>
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            1:1
            <span>重置</span>
          </button>
        </aside>

        <section className="canvas-panel" aria-label="思维导图画布">
          <div className="canvas-meta">
            <span>左到右布局</span>
            <span>{Math.round(zoom * 100)}%</span>
          </div>

          <svg
            className="mindmap-canvas"
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            role="img"
            aria-label="OpenTools 初始化思维导图"
          >
            <defs>
              <pattern
                id="dot-grid"
                width="24"
                height="24"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="2" cy="2" r="1.2" fill="#d7d9e5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dot-grid)" />

            <g transform={`translate(80 80) scale(${zoom})`}>
              {layout.edges.map((edge) => (
                <path
                  key={edge.id}
                  className="connector"
                  d={createCubicConnectorPath(edge)}
                />
              ))}

              {layout.nodes.map((layoutNode) => {
                const node = document.nodes[layoutNode.id]
                if (!node) return null
                const isSelected = selectedNode?.id === node.id

                return (
                  <g
                    key={node.id}
                    className="mindmap-node"
                    transform={`translate(${layoutNode.x} ${layoutNode.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`节点：${node.text}`}
                    onClick={() => selectNode(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        selectNode(node.id)
                      }
                    }}
                  >
                    <rect
                      width={layoutNode.width}
                      height={layoutNode.height}
                      rx="14"
                      fill={node.style.backgroundColor}
                      stroke={node.style.borderColor}
                      strokeWidth={isSelected ? 3 : 1.5}
                    />
                    <text
                      x={layoutNode.width / 2}
                      y={layoutNode.height / 2 + 5}
                      textAnchor="middle"
                      fill={node.style.textColor}
                    >
                      {node.text}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
        </section>

        <aside className="inspector">
          <p className="eyebrow">当前节点</p>
          <h2>{selectedNode?.text ?? '未选择节点'}</h2>
          <dl>
            <div>
              <dt>节点 ID</dt>
              <dd>{selectedNode?.id ?? '—'}</dd>
            </div>
            <div>
              <dt>子节点</dt>
              <dd>{selectedNode?.childIds.length ?? 0}</dd>
            </div>
            <div>
              <dt>数据版本</dt>
              <dd>v{document.schemaVersion}</dd>
            </div>
          </dl>
          <div className="architecture-note">
            <strong>初始化完成</strong>
            <p>领域模型、布局、SVG 渲染、IndexedDB 和 JSON 格式已经分包。</p>
          </div>
        </aside>
      </section>
    </main>
  )
}
