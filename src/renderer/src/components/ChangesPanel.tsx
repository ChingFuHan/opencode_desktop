import { useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import type { DiffContent, FileChange, Project } from '../../../shared/types'

interface Props {
  project: Project | null
  changes: FileChange[]
}

export function ChangesPanel({ project, changes }: Props): JSX.Element {
  const [selected, setSelected] = useState<FileChange | null>(null)
  const [diff, setDiff] = useState<DiffContent | null>(null)

  const openDiff = async (change: FileChange): Promise<void> => {
    if (!project) return
    setSelected(change)
    setDiff(await window.api.getDiff(project.id, change.path))
  }

  if (!project) return <div className="empty-hint pad">No project selected.</div>
  if (changes.length === 0)
    return <div className="empty-hint pad">No file changes detected in the last run.</div>

  return (
    <div className="changes-panel">
      <div className="changes-list">
        {changes.map((c) => (
          <div
            key={c.path}
            className={selected?.path === c.path ? 'change-row active' : 'change-row'}
            onClick={() => openDiff(c)}
            title={c.path}
          >
            <span className={`change-status ${c.status}`}>
              {c.status === 'added' ? 'A' : c.status === 'deleted' ? 'D' : 'M'}
            </span>
            <span className="change-path">{c.relativePath}</span>
          </div>
        ))}
      </div>
      <div className="diff-view">
        {diff ? (
          <DiffEditor
            original={diff.original}
            modified={diff.modified}
            language={diff.language}
            theme="vs-dark"
            options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false } }}
          />
        ) : (
          <div className="empty-hint pad">Select a changed file to view the diff.</div>
        )}
      </div>
    </div>
  )
}
