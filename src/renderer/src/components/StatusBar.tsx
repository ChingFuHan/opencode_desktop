import type { Project, RunStatus } from '../../../shared/types'

interface Props {
  project: Project | null
  status: RunStatus
}

const STATUS_LABEL: Record<RunStatus, string> = {
  idle: 'Idle',
  running: 'Running…',
  stopped: 'Stopped',
  error: 'Error',
  completed: 'Completed'
}

export function StatusBar({ project, status }: Props): JSX.Element {
  return (
    <div className="status-bar">
      <span className={`status-dot ${status}`} />
      <span>{STATUS_LABEL[status]}</span>
      <span className="status-path">{project ? project.path : 'No project selected'}</span>
    </div>
  )
}
