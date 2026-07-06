import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AgentMode,
  ChatMessage,
  FileChange,
  Project,
  RunStatus,
  Session,
  Settings
} from '../../shared/types'
import { Sidebar } from './components/Sidebar'
import { ChatPanel } from './components/ChatPanel'
import { TerminalPanel, type TerminalHandle } from './components/TerminalPanel'
import { ChangesPanel } from './components/ChangesPanel'
import { SettingsModal } from './components/SettingsModal'
import { StatusBar } from './components/StatusBar'

interface OpenedFile {
  path: string
  name: string
  content: string
  error: string | null
  loading: boolean
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

export default function App(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<RunStatus>('idle')
  const [changes, setChanges] = useState<FileChange[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bottomTab, setBottomTab] = useState<'terminal' | 'changes'>('terminal')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [liveAssistant, setLiveAssistant] = useState('')
  const [openedFile, setOpenedFile] = useState<OpenedFile | null>(null)

  const terminalRef = useRef<TerminalHandle>(null)
  const activeProjectRef = useRef<Project | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const settingsRef = useRef<Settings | null>(null)
  activeProjectRef.current = activeProject
  sessionRef.current = session
  settingsRef.current = settings

  const refreshProjects = useCallback(async () => {
    setProjects(await window.api.listProjects())
  }, [])

  useEffect(() => {
    refreshProjects()
    window.api.loadSettings().then(setSettings)
    window.api.listModels().then((r) => {
      if (r.ok) setModels(r.models)
    })
  }, [refreshProjects])

  const openProject = useCallback(async (project: Project) => {
    const fresh = await window.api.openProject(project.id)
    setActiveProject(fresh)
    setStatus((await window.api.isRunning(fresh.id)) ? 'running' : 'idle')
    const s = await window.api.getOrCreateSession(fresh.id)
    setSession(s)
    setMessages(await window.api.listMessages(s.id))
    setChanges([])
    setLiveAssistant('')
    terminalRef.current?.clear()
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
        setChanges([])
        setLiveAssistant('')
        setOpenedFile(null)
        terminalRef.current?.clear()
      }
      await refreshProjects()
    },
    [refreshProjects]
  )

  // Stream CLI output + status
  useEffect(() => {
    const offOutput = window.api.onRunOutput((e) => {
      if (e.projectId !== activeProjectRef.current?.id) return
      if (e.stream === 'assistant') {
        setLiveAssistant(e.data)
      } else {
        terminalRef.current?.write(e.data)
      }
    })
    const offStatus = window.api.onRunStatus(async (e) => {
      if (e.projectId !== activeProjectRef.current?.id) return
      setStatus(e.status)
      if (e.status === 'completed' || e.status === 'error' || e.status === 'stopped') {
        setLiveAssistant('')
        const project = activeProjectRef.current
        const s = sessionRef.current
        if (s) {
          setMessages(await window.api.listMessages(s.id))
          // opencode session id may have just been captured — refresh session row
          if (project) setSession(await window.api.getOrCreateSession(project.id))
        }
        if (project) setChanges(await window.api.getChanges(project.id))
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
    const mode = settingsRef.current?.agentMode ?? 'build'
    if (!project || !s) return
    setLiveAssistant('')
    const result = await window.api.startRun(project.id, s.id, prompt, mode)
    setMessages(await window.api.listMessages(s.id))
    if (!result.ok && result.error) {
      terminalRef.current?.write(`\r\n\x1b[31m${result.error}\x1b[0m\r\n`)
    }
  }, [])

  const stopRun = useCallback(() => {
    const project = activeProjectRef.current
    if (project) window.api.stopRun(project.id)
  }, [])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const current = settingsRef.current
    if (!current) return
    const next = { ...current, ...patch }
    setSettings(next)
    await window.api.saveSettings(next)
  }, [])

  const newSession = useCallback(async () => {
    const project = activeProjectRef.current
    if (!project) return
    const s = await window.api.newSession(project.id)
    setSession(s)
    setMessages([])
    setLiveAssistant('')
    terminalRef.current?.clear()
  }, [])

  const openFile = useCallback(async (filePath: string) => {
    const project = activeProjectRef.current
    if (!project) return
    setOpenedFile({
      path: filePath,
      name: fileNameFromPath(filePath),
      content: '',
      error: null,
      loading: true
    })
    try {
      const content = await window.api.readFile(project.id, filePath)
      setOpenedFile({
        path: filePath,
        name: fileNameFromPath(filePath),
        content,
        error: null,
        loading: false
      })
    } catch (err) {
      setOpenedFile({
        path: filePath,
        name: fileNameFromPath(filePath),
        content: '',
        error: err instanceof Error ? err.message : String(err),
        loading: false
      })
    }
  }, [])

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        activeProject={activeProject}
        onAddProject={addProject}
        onOpenProject={openProject}
        onRemoveProject={removeProject}
        onOpenFile={openFile}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="main">
        <ChatPanel
          project={activeProject}
          session={session}
          messages={messages}
          status={status}
          liveAssistant={liveAssistant}
          mode={settings?.agentMode ?? 'build'}
          model={settings?.model ?? ''}
          models={models}
          onModeChange={(mode: AgentMode) => updateSettings({ agentMode: mode })}
          onModelChange={(model: string) => updateSettings({ model })}
          onNewSession={newSession}
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
        <StatusBar project={activeProject} status={status} mode={settings?.agentMode ?? 'build'} model={settings?.model ?? ''} session={session} />
      </div>
      {settingsOpen && (
        <SettingsModal
          models={models}
          onClose={() => {
            setSettingsOpen(false)
            window.api.loadSettings().then(setSettings)
          }}
        />
      )}
      {openedFile && (
        <div className="modal-backdrop" onClick={() => setOpenedFile(null)}>
          <div className="modal file-viewer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="file-viewer-title">
                <strong>{openedFile.name}</strong>
                <span>{openedFile.path}</span>
              </div>
              <button className="icon-btn" title="Close" onClick={() => setOpenedFile(null)}>
                x
              </button>
            </div>
            <div className="modal-body file-viewer-body">
              {openedFile.loading && <div className="empty-hint">Loading file...</div>}
              {openedFile.error && <div className="file-viewer-error">{openedFile.error}</div>}
              {!openedFile.loading && !openedFile.error && (
                <pre className="file-viewer-content">{openedFile.content}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
