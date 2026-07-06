import type { AgentMode, Project, RunStatus, Session } from '../../../shared/types'

interface Props {
  project: Project | null
  status: RunStatus
  mode: AgentMode
  model: string
  session: Session | null
}

const STATUS_LABEL: Record<RunStatus, string> = {
  idle: 'Idle',
  running: 'Running…',
  stopped: 'Stopped',
  error: 'Error',
  completed: 'Completed'
}

export function StatusBar({ project, status, mode, model, session }: Props): JSX.Element {
  return (
    <div className="status-bar">
      <span className={`status-dot ${status}`} />
      <span>{STATUS_LABEL[status]}</span>
      <span className="status-chip">{mode === 'plan' ? 'Plan' : 'Build'}</span>
      <span className="status-chip" title="Model passed as --model (empty = CLI default)">
        {model || 'default model'}
      </span>
      {session?.opencodeSessionId && (
        <span className="status-chip" title="opencode session continued with -s">
          {session.opencodeSessionId.slice(0, 16)}…
        </span>
      )}
      <span className="status-path">{project ? project.path : 'No project selected'}</span>
    </div>
  )
}
