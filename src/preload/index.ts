import { contextBridge, ipcRenderer } from 'electron'
import type {
  ChatMessage,
  DiffContent,
  FileChange,
  FileNode,
  MessageRole,
  Project,
  RunOutputEvent,
  RunStatusEvent,
  Session,
  Settings
} from '../shared/types'

const api = {
  // Projects
  selectFolder: (): Promise<Project | null> => ipcRenderer.invoke('project:selectFolder'),
  listProjects: (): Promise<Project[]> => ipcRenderer.invoke('project:list'),
  openProject: (path: string): Promise<Project> => ipcRenderer.invoke('project:open', path),
  removeProject: (id: number): Promise<void> => ipcRenderer.invoke('project:remove', id),
  getFileTree: (path: string): Promise<FileNode[]> => ipcRenderer.invoke('project:tree', path),

  // Sessions
  getOrCreateSession: (projectId: number): Promise<Session> => ipcRenderer.invoke('session:getOrCreate', projectId),
  listMessages: (sessionId: number): Promise<ChatMessage[]> => ipcRenderer.invoke('session:messages', sessionId),
  addMessage: (sessionId: number, role: MessageRole, content: string): Promise<ChatMessage> =>
    ipcRenderer.invoke('session:addMessage', sessionId, role, content),

  // Settings
  loadSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: Settings): Promise<Settings> => ipcRenderer.invoke('settings:save', settings),

  // CLI runs
  startRun: (projectId: number, projectPath: string, prompt: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('run:start', projectId, projectPath, prompt),
  stopRun: (projectId: number): Promise<boolean> => ipcRenderer.invoke('run:stop', projectId),
  isRunning: (projectId: number): Promise<boolean> => ipcRenderer.invoke('run:isRunning', projectId),
  onRunOutput: (cb: (e: RunOutputEvent) => void): (() => void) => {
    const listener = (_e: unknown, payload: RunOutputEvent): void => cb(payload)
    ipcRenderer.on('run:output', listener)
    return () => ipcRenderer.removeListener('run:output', listener)
  },
  onRunStatus: (cb: (e: RunStatusEvent) => void): (() => void) => {
    const listener = (_e: unknown, payload: RunStatusEvent): void => cb(payload)
    ipcRenderer.on('run:status', listener)
    return () => ipcRenderer.removeListener('run:status', listener)
  },

  // Files / diff
  getChanges: (projectPath: string): Promise<FileChange[]> => ipcRenderer.invoke('files:changes', projectPath),
  getDiff: (projectPath: string, filePath: string): Promise<DiffContent> =>
    ipcRenderer.invoke('files:diff', projectPath, filePath),
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('files:read', filePath)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
