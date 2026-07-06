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
  /** opencode CLI session id (ses_...) used with `opencode run -s` to continue the conversation. */
  opencodeSessionId: string | null
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ChatMessage {
  id: number
  sessionId: number
  role: MessageRole
  content: string
  createdAt: string
}

/**
 * How opencode handles permission requests.
 * - 'ask': opencode's default behavior (its own permission config decides / asks).
 * - 'auto': passes `--auto` which auto-approves anything not explicitly denied (dangerous).
 * The opencode CLI has no read-only/workspace-write sandbox flags, so we do not pretend to.
 */
export type ApprovalPolicy = 'ask' | 'auto'

/** Primary opencode agent used for a run. Passed as `--agent build` / `--agent plan`. */
export type AgentMode = 'build' | 'plan'

export interface Settings {
  cliPath: string
  model: string
  provider: string
  approvalPolicy: ApprovalPolicy
  agentMode: AgentMode
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
  /**
   * 'stdout' / 'stderr': raw process output rendered in the terminal.
   * 'assistant': extracted assistant text (from --format json text events) for the chat view.
   */
  stream: 'stdout' | 'stderr' | 'assistant'
  data: string
}

export interface RunStartOptions {
  projectId: number
  prompt: string
  mode: AgentMode
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
  approvalPolicy: 'ask',
  agentMode: 'build',
  defaultFlags: ''
}
