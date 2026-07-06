import { useEffect, useState } from 'react'
import type { FileNode, Project } from '../../../shared/types'

interface Props {
  projects: Project[]
  activeProject: Project | null
  onAddProject: () => void
  onOpenProject: (p: Project) => void
  onRemoveProject: (id: number) => void
  onOpenFile: (path: string) => void
  onOpenSettings: () => void
}

function TreeNode({
  node,
  depth,
  onOpenFile
}: {
  node: FileNode
  depth: number
  onOpenFile: (path: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(depth === 0)
  return (
    <div>
      <div
        className="tree-row"
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => (node.isDirectory ? setOpen(!open) : onOpenFile(node.path))}
        title={node.path}
      >
        <span className="tree-icon">{node.isDirectory ? (open ? '📂' : '📁') : '📄'}</span>
        <span className="tree-name">{node.name}</span>
      </div>
      {node.isDirectory &&
        open &&
        node.children?.map((c) => (
          <TreeNode key={c.path} node={c} depth={depth + 1} onOpenFile={onOpenFile} />
        ))}
    </div>
  )
}

export function Sidebar(props: Props): JSX.Element {
  const { projects, activeProject } = props
  const [tree, setTree] = useState<FileNode[]>([])

  useEffect(() => {
    if (!activeProject) {
      setTree([])
      return
    }
    window.api.getFileTree(activeProject.id).then(setTree)
  }, [activeProject])

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="app-title">OpenCode Desktop</span>
        <button className="icon-btn" title="Settings" onClick={props.onOpenSettings}>
          ⚙
        </button>
      </div>

      <div className="sidebar-section">
        <div className="section-title">
          Projects
          <button className="icon-btn" title="Add project folder" onClick={props.onAddProject}>
            ＋
          </button>
        </div>
        <div className="project-list">
          {projects.length === 0 && <div className="empty-hint">No projects yet. Click ＋ to add one.</div>}
          {projects.map((p) => (
            <div
              key={p.id}
              className={p.id === activeProject?.id ? 'project-row active' : 'project-row'}
              onClick={() => props.onOpenProject(p)}
              title={p.path}
            >
              <span className="project-name">{p.name}</span>
              <button
                className="icon-btn remove"
                title="Remove from list"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onRemoveProject(p.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-section grow">
        <div className="section-title">Files</div>
        <div className="file-tree">
          {tree.map((n) => (
            <TreeNode key={n.path} node={n} depth={0} onOpenFile={props.onOpenFile} />
          ))}
        </div>
      </div>
    </div>
  )
}
