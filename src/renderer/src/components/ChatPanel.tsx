import { useEffect, useRef, useState } from 'react'
import type { AgentMode, ChatMessage, Project, RunStatus, Session } from '../../../shared/types'

interface Props {
  project: Project | null
  session: Session | null
  messages: ChatMessage[]
  status: RunStatus
  liveAssistant: string
  mode: AgentMode
  model: string
  models: string[]
  onModeChange: (mode: AgentMode) => void
  onModelChange: (model: string) => void
  onNewSession: () => void
  onSend: (prompt: string) => void
  onStop: () => void
}

const ROLE_LABEL: Record<string, string> = {
  user: 'You',
  assistant: 'OpenCode',
  system: 'System',
  tool: 'Tool'
}

export function ChatPanel(props: Props): JSX.Element {
  const { project, session, messages, status, liveAssistant, mode, model, models } = props
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, status, liveAssistant])

  const running = status === 'running'

  const submit = (): void => {
    const prompt = input.trim()
    if (!prompt || !project || running) return
    setInput('')
    props.onSend(prompt)
  }

  if (!project) {
    return (
      <div className="chat-panel empty">
        <div className="empty-state">
          <h2>OpenCode Desktop</h2>
          <p>Select or add a project folder on the left to start working.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-panel">
      <div className="chat-toolbar">
        <div className="mode-toggle" title="Plan: read-only planning agent. Build: full coding agent. Passed as --agent to opencode.">
          <button
            className={mode === 'plan' ? 'mode-btn active' : 'mode-btn'}
            disabled={running}
            onClick={() => props.onModeChange('plan')}
          >
            Plan
          </button>
          <button
            className={mode === 'build' ? 'mode-btn active' : 'mode-btn'}
            disabled={running}
            onClick={() => props.onModeChange('build')}
          >
            Build
          </button>
        </div>
        <select
          className="model-select"
          title="Model passed as --model to opencode (empty = CLI default)"
          value={model}
          disabled={running}
          onChange={(e) => props.onModelChange(e.target.value)}
        >
          <option value="">CLI default model</option>
          {model && !models.includes(model) && <option value={model}>{model}</option>}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div className="toolbar-spacer" />
        {session?.opencodeSessionId && (
          <span className="session-chip" title={`opencode session ${session.opencodeSessionId} — prompts continue this conversation`}>
            {session.opencodeSessionId.slice(0, 12)}…
          </span>
        )}
        <button className="btn small" disabled={running} onClick={props.onNewSession} title="Start a fresh opencode session for this project">
          New Session
        </button>
      </div>
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && !liveAssistant && (
          <div className="empty-hint chat-hint">Send a prompt to run the OpenCode agent in {project.name}.</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <div className="message-role">{ROLE_LABEL[m.role] ?? m.role}</div>
            <pre className="message-content">{m.content}</pre>
          </div>
        ))}
        {running && liveAssistant && (
          <div className="message assistant live">
            <div className="message-role">OpenCode</div>
            <pre className="message-content">{liveAssistant}</pre>
          </div>
        )}
        {running && !liveAssistant && (
          <div className="message system">
            <div className="message-role">System</div>
            <pre className="message-content">Agent running ({mode})… output streams in the terminal below.</pre>
          </div>
        )}
      </div>
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          placeholder={running ? 'Agent is running…' : `Prompt for ${project.name} (Enter to send, Shift+Enter for newline)`}
          value={input}
          disabled={running}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {running ? (
          <button className="btn danger" onClick={props.onStop}>
            Stop
          </button>
        ) : (
          <button className="btn primary" onClick={submit} disabled={!input.trim()}>
            Send
          </button>
        )}
      </div>
    </div>
  )
}
