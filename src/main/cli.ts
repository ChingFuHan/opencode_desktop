import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import type { AgentMode, RunOutputEvent, RunStatusEvent, Settings } from '../shared/types'

interface RunHooks {
  /** Called once when the opencode session id (ses_...) is first seen in the JSON event stream. */
  onOpencodeSessionId: (id: string) => void
  /** Called when the process ends, with the accumulated assistant text (may be empty). */
  onFinished: (assistantText: string, status: 'completed' | 'stopped' | 'error', exitCode: number | null, message?: string) => void
}

interface RunningProcess {
  child: ChildProcess
  stoppedByUser: boolean
}

const running = new Map<number, RunningProcess>()

function send(win: BrowserWindow, channel: string, payload: RunOutputEvent | RunStatusEvent): void {
  if (!win.isDestroyed()) win.webContents.send(channel, payload)
}

export function isRunning(projectId: number): boolean {
  return running.has(projectId)
}

const exeCache = new Map<string, string | null>()

/**
 * Resolve the configured CLI path to a real .exe we can spawn with shell:false.
 * npm installs opencode as a .cmd shim; spawning that requires a shell, which
 * would push the prompt through cmd.exe unescaped. Instead we locate the actual
 * opencode.exe next to the shim (node_modules/opencode-ai/bin/opencode.exe).
 */
export function resolveCliExecutable(cliPath: string): string | null {
  const key = cliPath || 'opencode'
  if (exeCache.has(key)) return exeCache.get(key) ?? null

  const result = doResolve(key)
  exeCache.set(key, result)
  return result
}

function doResolve(cliPath: string): string | null {
  // Explicit path to an existing file
  if (path.isAbsolute(cliPath) && fs.existsSync(cliPath)) {
    if (cliPath.toLowerCase().endsWith('.exe') || process.platform !== 'win32') return cliPath
    const viaShim = exeNextToShim(cliPath)
    if (viaShim) return viaShim
    return null
  }

  if (process.platform !== 'win32') {
    return cliPath // POSIX: shell shims are executable directly
  }

  // Bare command name: use `where` to find it on PATH
  let hits: string[] = []
  try {
    hits = execFileSync('where.exe', [cliPath], { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return null
  }
  for (const hit of hits) {
    if (hit.toLowerCase().endsWith('.exe')) return hit
  }
  for (const hit of hits) {
    const viaShim = exeNextToShim(hit)
    if (viaShim) return viaShim
  }
  return null
}

/** npm shim at <dir>/opencode.cmd launches <dir>/node_modules/opencode-ai/bin/opencode.exe */
function exeNextToShim(shimPath: string): string | null {
  const candidate = path.join(path.dirname(shimPath), 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
  return fs.existsSync(candidate) ? candidate : null
}

function buildArgs(prompt: string, settings: Settings, mode: AgentMode, opencodeSessionId: string | null): string[] {
  const args = ['run', '--format', 'json', '--agent', mode]
  if (settings.model) args.push('--model', settings.model)
  if (opencodeSessionId) args.push('--session', opencodeSessionId)
  if (settings.approvalPolicy === 'auto') args.push('--auto')
  const extra = settings.defaultFlags.trim()
  if (extra) args.push(...extra.split(/\s+/))
  args.push(prompt)
  return args
}

const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

interface StreamState {
  lineBuffer: string
  /** part id -> latest text, insertion-ordered; handles both complete and re-emitted parts */
  textParts: Map<string, string>
  sessionIdSeen: boolean
}

function assistantText(state: StreamState): string {
  return [...state.textParts.values()].join('\n\n').trim()
}

function handleJsonEvent(
  win: BrowserWindow,
  projectId: number,
  event: Record<string, unknown>,
  state: StreamState,
  hooks: RunHooks
): void {
  const sessionID = typeof event['sessionID'] === 'string' ? (event['sessionID'] as string) : null
  if (sessionID && !state.sessionIdSeen) {
    state.sessionIdSeen = true
    hooks.onOpencodeSessionId(sessionID)
    send(win, 'run:output', { projectId, stream: 'stdout', data: `${DIM}session ${sessionID}${RESET}\n` })
  }

  const type = event['type']
  const part = (event['part'] ?? {}) as Record<string, unknown>

  if (type === 'text' && typeof part['text'] === 'string') {
    const partId = typeof part['id'] === 'string' ? (part['id'] as string) : `anon-${state.textParts.size}`
    const isNew = !state.textParts.has(partId)
    state.textParts.set(partId, part['text'] as string)
    send(win, 'run:output', { projectId, stream: 'assistant', data: assistantText(state) })
    if (isNew) {
      send(win, 'run:output', { projectId, stream: 'stdout', data: `${part['text'] as string}\n` })
    }
    return
  }
  if (type === 'step_start') {
    send(win, 'run:output', { projectId, stream: 'stdout', data: `${DIM}── step start ──${RESET}\n` })
    return
  }
  if (type === 'step_finish') {
    const tokens = (part['tokens'] ?? {}) as Record<string, unknown>
    const cost = part['cost']
    const line = `${DIM}── step finish · tokens ${tokens['total'] ?? '?'} (in ${tokens['input'] ?? '?'} / out ${tokens['output'] ?? '?'}) · cost ${cost ?? '?'} ──${RESET}\n`
    send(win, 'run:output', { projectId, stream: 'stdout', data: line })
    return
  }
  // Tool calls and any other structured events: compact one-liner
  const partType = typeof part['type'] === 'string' ? (part['type'] as string) : String(type ?? 'event')
  const tool = typeof part['tool'] === 'string' ? ` ${part['tool'] as string}` : ''
  const stateObj = part['state'] as Record<string, unknown> | undefined
  const status = stateObj && typeof stateObj['status'] === 'string' ? ` (${stateObj['status'] as string})` : ''
  send(win, 'run:output', { projectId, stream: 'stdout', data: `${YELLOW}[${partType}]${tool}${status}${RESET}\n` })
}

function consumeStdout(
  win: BrowserWindow,
  projectId: number,
  chunk: string,
  state: StreamState,
  hooks: RunHooks
): void {
  state.lineBuffer += chunk
  const lines = state.lineBuffer.split('\n')
  state.lineBuffer = lines.pop() ?? ''
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line) as Record<string, unknown>
      handleJsonEvent(win, projectId, event, state, hooks)
    } catch {
      // Not JSON (e.g. plugin output) — show raw
      send(win, 'run:output', { projectId, stream: 'stdout', data: `${line}\n` })
    }
  }
}

export function startRun(
  win: BrowserWindow,
  projectId: number,
  projectPath: string,
  prompt: string,
  settings: Settings,
  mode: AgentMode,
  opencodeSessionId: string | null,
  hooks: RunHooks
): { ok: boolean; error?: string } {
  if (running.has(projectId)) {
    return { ok: false, error: 'An agent process is already running for this project.' }
  }

  const exe = resolveCliExecutable(settings.cliPath)
  if (!exe) {
    return {
      ok: false,
      error:
        `Could not resolve the opencode executable from "${settings.cliPath || 'opencode'}". ` +
        'Set the CLI path in Settings to the full path of opencode.exe ' +
        '(npm installs it at %APPDATA%\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe).'
    }
  }

  const args = buildArgs(prompt, settings, mode, opencodeSessionId)
  let child: ChildProcess
  try {
    // shell:false + argv array: the prompt is passed as a single argument with no
    // shell interpretation, so quotes/&/| in prompts cannot inject commands.
    child = spawn(exe, args, {
      cwd: projectPath,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    })
  } catch (err) {
    return { ok: false, error: String(err) }
  }

  const entry: RunningProcess = { child, stoppedByUser: false }
  running.set(projectId, entry)
  send(win, 'run:status', { projectId, status: 'running' })
  send(win, 'run:output', {
    projectId,
    stream: 'stdout',
    data: `${CYAN}$ opencode run --agent ${mode}${settings.model ? ` --model ${settings.model}` : ''}${opencodeSessionId ? ` --session ${opencodeSessionId}` : ''}${RESET}\n`
  })

  const state: StreamState = { lineBuffer: '', textParts: new Map(), sessionIdSeen: false }

  child.stdout?.on('data', (data: Buffer) => {
    consumeStdout(win, projectId, data.toString('utf8'), state, hooks)
  })
  child.stderr?.on('data', (data: Buffer) => {
    send(win, 'run:output', { projectId, stream: 'stderr', data: data.toString('utf8') })
  })
  child.on('error', (err) => {
    running.delete(projectId)
    send(win, 'run:status', { projectId, status: 'error', message: err.message })
    hooks.onFinished(assistantText(state), 'error', null, err.message)
  })
  child.on('close', (code) => {
    if (state.lineBuffer.trim()) consumeStdout(win, projectId, '\n', state, hooks)
    const wasStopped = running.get(projectId)?.stoppedByUser ?? entry.stoppedByUser
    running.delete(projectId)
    if (wasStopped) {
      send(win, 'run:status', { projectId, status: 'stopped', exitCode: code })
      hooks.onFinished(assistantText(state), 'stopped', code)
    } else if (code === 0) {
      send(win, 'run:status', { projectId, status: 'completed', exitCode: code })
      hooks.onFinished(assistantText(state), 'completed', code)
    } else {
      const message = `Process exited with code ${code}`
      send(win, 'run:status', { projectId, status: 'error', exitCode: code, message })
      hooks.onFinished(assistantText(state), 'error', code, message)
    }
  })

  return { ok: true }
}

export function stopRun(projectId: number): boolean {
  const entry = running.get(projectId)
  if (!entry) return false
  entry.stoppedByUser = true
  const pid = entry.child.pid
  if (process.platform === 'win32' && pid) {
    // Kill the whole process tree (CLI + any children it spawned) on Windows.
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  } else {
    entry.child.kill('SIGTERM')
  }
  return true
}

export function stopAll(): void {
  for (const projectId of running.keys()) stopRun(projectId)
}

const modelsCache = { at: 0, list: [] as string[] }
const MODELS_CACHE_MS = 5 * 60 * 1000

/** List models via `opencode models` (async spawn — never blocks the main process). Cached for 5 minutes. */
export function listModels(settings: Settings): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const now = Date.now()
  if (modelsCache.list.length > 0 && now - modelsCache.at < MODELS_CACHE_MS) {
    return Promise.resolve({ ok: true, models: modelsCache.list })
  }
  const exe = resolveCliExecutable(settings.cliPath)
  if (!exe) return Promise.resolve({ ok: false, models: [], error: 'opencode executable not found' })

  return new Promise((resolve) => {
    const child = spawn(exe, ['models'], { windowsHide: true, shell: false })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ ok: false, models: [], error: 'opencode models timed out after 30s' })
    }, 30_000)
    child.stdout?.on('data', (d: Buffer) => (out += d.toString('utf8')))
    child.stderr?.on('data', (d: Buffer) => (err += d.toString('utf8')))
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, models: [], error: e.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        resolve({ ok: false, models: [], error: err.trim() || `opencode models exited with code ${code}` })
        return
      }
      const models = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.includes('/'))
      modelsCache.at = now
      modelsCache.list = models
      resolve({ ok: true, models })
    })
  })
}
