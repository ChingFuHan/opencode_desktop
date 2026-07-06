import { spawn, type ChildProcess } from 'node:child_process'
import type { BrowserWindow } from 'electron'
import type { RunOutputEvent, RunStatusEvent, Settings } from '../shared/types'

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

function buildArgs(prompt: string, settings: Settings): string[] {
  const args = ['run']
  if (settings.model) args.push('--model', settings.model)
  const extra = settings.defaultFlags.trim()
  if (extra) args.push(...extra.split(/\s+/))
  args.push(prompt)
  return args
}

export function startRun(
  win: BrowserWindow,
  projectId: number,
  projectPath: string,
  prompt: string,
  settings: Settings
): { ok: boolean; error?: string } {
  if (running.has(projectId)) {
    return { ok: false, error: 'An agent process is already running for this project.' }
  }

  const args = buildArgs(prompt, settings)
  let child: ChildProcess
  try {
    child = spawn(settings.cliPath || 'opencode', args, {
      cwd: projectPath,
      shell: process.platform === 'win32',
      windowsHide: true,
      env: { ...process.env }
    })
  } catch (err) {
    return { ok: false, error: String(err) }
  }

  const entry: RunningProcess = { child, stoppedByUser: false }
  running.set(projectId, entry)
  send(win, 'run:status', { projectId, status: 'running' })

  child.stdout?.on('data', (data: Buffer) => {
    send(win, 'run:output', { projectId, stream: 'stdout', data: data.toString('utf8') })
  })
  child.stderr?.on('data', (data: Buffer) => {
    send(win, 'run:output', { projectId, stream: 'stderr', data: data.toString('utf8') })
  })
  child.on('error', (err) => {
    running.delete(projectId)
    send(win, 'run:status', { projectId, status: 'error', message: err.message })
  })
  child.on('close', (code) => {
    const wasStopped = running.get(projectId)?.stoppedByUser ?? entry.stoppedByUser
    running.delete(projectId)
    if (wasStopped) {
      send(win, 'run:status', { projectId, status: 'stopped', exitCode: code })
    } else if (code === 0) {
      send(win, 'run:status', { projectId, status: 'completed', exitCode: code })
    } else {
      send(win, 'run:status', { projectId, status: 'error', exitCode: code, message: `Process exited with code ${code}` })
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
    // Kill the whole process tree (shell + CLI + children) on Windows.
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  } else {
    entry.child.kill('SIGTERM')
  }
  return true
}

export function stopAll(): void {
  for (const projectId of running.keys()) stopRun(projectId)
}
