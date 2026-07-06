import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, Project, RunStatus } from '../../../shared/types'

interface Props {
  project: Project | null
  messages: ChatMessage[]
  status: RunStatus
  onSend: (prompt: string) => void
  onStop: () => void
}

const ROLE_LABEL: Record<string, string> = {
  user: 'You',
  assistant: 'OpenCode',
  system: 'System',
  tool: 'Tool'
}

export function ChatPanel({ project, messages, status, onSend, onStop }: Props): JSX.Element {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, status])

  const running = status === 'running'

  const submit = (): void => {
    const prompt = input.trim()
    if (!prompt || !project || running) return
    setInput('')
    onSend(prompt)
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
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-hint chat-hint">Send a prompt to run the OpenCode agent in {project.name}.</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <div className="message-role">{ROLE_LABEL[m.role] ?? m.role}</div>
            <pre className="message-content">{m.content}</pre>
          </div>
        ))}
        {running && (
          <div className="message system">
            <div className="message-role">System</div>
            <pre className="message-content">Agent running… output streams in the terminal below.</pre>
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
          <button className="btn danger" onClick={onStop}>
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
