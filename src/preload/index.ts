import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentMode,
  ChatMessage,
  DiffContent,
  FileChange,
  FileNode,
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
  openProject: (projectId: number): Promise<Project> => ipcRenderer.invoke('project:open', projectId),
  removeProject: (id: number): Promise<void> => ipcRenderer.invoke('project:remove', id),
  getFileTree: (projectId: number): Promise<FileNode[]> => ipcRenderer.invoke('project:tree', projectId),

  // Sessions
  getOrCreateSession: (projectId: number): Promise<Session> => ipcRenderer.invoke('session:getOrCreate', projectId),
  newSession: (projectId: number): Promise<Session> => ipcRenderer.invoke('session:new', projectId),
  listMessages: (sessionId: number): Promise<ChatMessage[]> => ipcRenderer.invoke('session:messages', sessionId),

  // Settings
  loadSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: Settings): Promise<Settings> => ipcRenderer.invoke('settings:save', settings),

  // Models
  listModels: (): Promise<{ ok: boolean; models: string[]; error?: string }> => ipcRenderer.invoke('models:list'),

  // CLI runs
  startRun: (
    projectId: number,
    sessionId: number,
    prompt: string,
    mode: AgentMode
  ): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('run:start', projectId, sessionId, prompt, mode),
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
  getChanges: (projectId: number): Promise<FileChange[]> => ipcRenderer.invoke('files:changes', projectId),
  getDiff: (projectId: number, filePath: string): Promise<DiffContent> =>
    ipcRenderer.invoke('files:diff', projectId, filePath),
  readFile: (projectId: number, filePath: string): Promise<string> =>
    ipcRenderer.invoke('files:read', projectId, filePath)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
