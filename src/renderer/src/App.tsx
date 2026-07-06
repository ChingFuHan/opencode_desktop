import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, FileChange, Project, RunStatus, Session } from '../../shared/types'
import { Sidebar } from './components/Sidebar'
import { ChatPanel } from './components/ChatPanel'
import { TerminalPanel, type TerminalHandle } from './components/TerminalPanel'
import { ChangesPanel } from './components/ChangesPanel'
import { SettingsModal } from './components/SettingsModal'
import { StatusBar } from './components/StatusBar'

export default function App(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<RunStatus>('idle')
  const [changes, setChanges] = useState<FileChange[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bottomTab, setBottomTab] = useState<'terminal' | 'changes'>('terminal')

  const terminalRef = useRef<TerminalHandle>(null)
  const stdoutBuffer = useRef('')
  const activeProjectRef = useRef<Project | null>(null)
  const sessionRef = useRef<Session | null>(null)
  activeProjectRef.current = activeProject
  sessionRef.current = session

  const refreshProjects = useCallback(async () => {
    setProjects(await window.api.listProjects())
  }, [])

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  const openProject = useCallback(async (project: Project) => {
    const fresh = await window.api.openProject(project.path)
    setActiveProject(fresh)
    setStatus((await window.api.isRunning(fresh.id)) ? 'running' : 'idle')
    const s = await window.api.getOrCreateSession(fresh.id)
    setSession(s)
    setMessages(await window.api.listMessages(s.id))
    setChanges([])
    setProjects(await window.api.listProjects())
  }, [])

  const addProject = useCallback(async () => {
    const project = await window.api.selectFolder()
    if (project) await openProject(project)
  }, [openProject])

  const removeProject = useCallback(
    async (id: number) => {
      await window.api.removeProject(id)
      if (activeProjectRef.current?.id === id) {
        setActiveProject(null)
        setSession(null)
        setMessages([])
      }
      await refreshProjects()
    },
    [refreshProjects]
  )

  // Stream CLI output + status
  useEffect(() => {
    const offOutput = window.api.onRunOutput((e) => {
      if (e.projectId !== activeProjectRef.current?.id) return
      terminalRef.current?.write(e.data)
      if (e.stream === 'stdout') stdoutBuffer.current += e.data
    })
    const offStatus = window.api.onRunStatus(async (e) => {
      if (e.projectId !== activeProjectRef.current?.id) return
      setStatus(e.status)
      if (e.status === 'completed' || e.status === 'error' || e.status === 'stopped') {
        const s = sessionRef.current
        const project = activeProjectRef.current
        if (s) {
          const text = stdoutBuffer.current.trim()
          if (text) await window.api.addMessage(s.id, 'assistant', text)
          if (e.status !== 'completed') {
            await window.api.addMessage(s.id, 'system', e.message ?? `Run ${e.status}`)
          }
          setMessages(await window.api.listMessages(s.id))
        }
        stdoutBuffer.current = ''
        if (project) setChanges(await window.api.getChanges(project.path))
      }
    })
    return () => {
      offOutput()
      offStatus()
    }
  }, [])

  const sendPrompt = useCallback(async (prompt: string) => {
    const project = activeProjectRef.current
    const s = sessionRef.current
    if (!project || !s) return
    await window.api.addMessage(s.id, 'user', prompt)
    setMessages(await window.api.listMessages(s.id))
    stdoutBuffer.current = ''
    terminalRef.current?.write(`\r\n\x1b[36m$ opencode run "${prompt.replace(/\n/g, ' ')}"\x1b[0m\r\n`)
    const result = await window.api.startRun(project.id, project.path, prompt)
    if (!result.ok) {
      await window.api.addMessage(s.id, 'system', result.error ?? 'Failed to start run')
      setMessages(await window.api.listMessages(s.id))
    }
  }, [])

  const stopRun = useCallback(() => {
    const project = activeProjectRef.current
    if (project) window.api.stopRun(project.id)
  }, [])

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        activeProject={activeProject}
        onAddProject={addProject}
        onOpenProject={openProject}
        onRemoveProject={removeProject}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="main">
        <ChatPanel
          project={activeProject}
          messages={messages}
          status={status}
          onSend={sendPrompt}
          onStop={stopRun}
        />
        <div className="bottom-panel">
          <div className="bottom-tabs">
            <button className={bottomTab === 'terminal' ? 'tab active' : 'tab'} onClick={() => setBottomTab('terminal')}>
              Terminal
            </button>
            <button className={bottomTab === 'changes' ? 'tab active' : 'tab'} onClick={() => setBottomTab('changes')}>
              File Changes {changes.length > 0 ? `(${changes.length})` : ''}
            </button>
          </div>
          <div className="bottom-content">
            <div style={{ display: bottomTab === 'terminal' ? 'block' : 'none', height: '100%' }}>
              <TerminalPanel ref={terminalRef} />
            </div>
            {bottomTab === 'changes' && <ChangesPanel project={activeProject} changes={changes} />}
          </div>
        </div>
        <StatusBar project={activeProject} status={status} />
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
