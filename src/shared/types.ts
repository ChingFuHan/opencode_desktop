export interface Project {
  id: number
  name: string
  path: string
  createdAt: string
  lastOpenedAt: string
}

export interface Session {
  id: number
  projectId: number
  title: string
  createdAt: string
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ChatMessage {
  id: number
  sessionId: number
  role: MessageRole
  content: string
  createdAt: string
}

export type SandboxMode = 'read-only' | 'workspace-write' | 'full-access'

export interface Settings {
  cliPath: string
  model: string
  provider: string
  sandboxMode: SandboxMode
  defaultFlags: string
}

export type RunStatus = 'idle' | 'running' | 'stopped' | 'error' | 'completed'

export interface RunStatusEvent {
  projectId: number
  status: RunStatus
  exitCode?: number | null
  message?: string
}

export interface RunOutputEvent {
  projectId: number
  stream: 'stdout' | 'stderr'
  data: string
}

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface FileChange {
  path: string
  relativePath: string
  status: 'added' | 'modified' | 'deleted'
}

export interface DiffContent {
  original: string
  modified: string
  language: string
}

export const DEFAULT_SETTINGS: Settings = {
  cliPath: 'opencode',
  model: '',
  provider: '',
  sandboxMode: 'workspace-write',
  defaultFlags: ''
}
