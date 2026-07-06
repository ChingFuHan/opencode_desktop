import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  addMessage,
  createSession,
  getOrCreateSession,
  getProjectById,
  getSessionById,
  initDb,
  listMessages,
  listProjects,
  removeProject,
  setSessionOpencodeId,
  upsertProject
} from './db'
import { loadSettings, saveSettings } from './settings'
import { isRunning, listModels, startRun, stopAll, stopRun } from './cli'
import { detectChanges, getDiff, readFileContent, readTree, takeSnapshot } from './files'
import { DEFAULT_SETTINGS, type AgentMode, type Settings } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#1e1e1e',
    title: 'OpenCode Desktop',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ---- IPC argument validation helpers ----

function reqNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid argument ${name}: expected non-negative integer`)
  }
  return value
}

function reqString(value: unknown, name: string, maxLen = 100_000): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLen) {
    throw new Error(`Invalid argument ${name}: expected non-empty string (max ${maxLen} chars)`)
  }
  return value
}

function reqAgentMode(value: unknown): AgentMode {
  if (value !== 'build' && value !== 'plan') throw new Error('Invalid agent mode: expected "build" or "plan"')
  return value
}

/** Resolve a project by id and ensure its path is still an existing directory. */
function reqProject(projectId: unknown): { id: number; path: string } {
  const id = reqNumber(projectId, 'projectId')
  const project = getProjectById(id)
  if (!project) throw new Error(`Unknown project id ${id}`)
  if (!fs.existsSync(project.path) || !fs.statSync(project.path).isDirectory()) {
    throw new Error(`Project folder no longer exists: ${project.path}`)
  }
  return { id: project.id, path: project.path }
}

/** Ensure filePath is inside the given project folder (blocks path traversal from the renderer). */
function reqPathInside(projectPath: string, filePath: unknown): string {
  const resolved = path.resolve(reqString(filePath, 'filePath', 4096))
  const rel = path.relative(path.resolve(projectPath), resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('File path is outside the project folder')
  }
  return resolved
}

function sanitizeSettings(value: unknown): Settings {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid settings object')
  const v = value as Record<string, unknown>
  return {
    cliPath: typeof v['cliPath'] === 'string' ? (v['cliPath'] as string).slice(0, 1024) : DEFAULT_SETTINGS.cliPath,
    model: typeof v['model'] === 'string' ? (v['model'] as string).slice(0, 256) : '',
    provider: typeof v['provider'] === 'string' ? (v['provider'] as string).slice(0, 256) : '',
    approvalPolicy: v['approvalPolicy'] === 'auto' ? 'auto' : 'ask',
    agentMode: v['agentMode'] === 'plan' ? 'plan' : 'build',
    defaultFlags: typeof v['defaultFlags'] === 'string' ? (v['defaultFlags'] as string).slice(0, 1024) : ''
  }
}

function registerIpc(): void {
  // Projects
  ipcMain.handle('project:selectFolder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return upsertProject(result.filePaths[0])
  })
  ipcMain.handle('project:list', () => listProjects())
  ipcMain.handle('project:open', (_e, projectId: unknown) => {
    const { path: projectPath } = reqProject(projectId)
    return upsertProject(projectPath)
  })
  ipcMain.handle('project:remove', (_e, id: unknown) => removeProject(reqNumber(id, 'id')))
  ipcMain.handle('project:tree', (_e, projectId: unknown) => readTree(reqProject(projectId).path))

  // Sessions / messages
  ipcMain.handle('session:getOrCreate', (_e, projectId: unknown) =>
    getOrCreateSession(reqProject(projectId).id)
  )
  ipcMain.handle('session:new', (_e, projectId: unknown) => createSession(reqProject(projectId).id))
  ipcMain.handle('session:messages', (_e, sessionId: unknown) => listMessages(reqNumber(sessionId, 'sessionId')))

  // Settings
  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.handle('settings:save', (_e, settings: unknown) => saveSettings(sanitizeSettings(settings)))

  // Models
  ipcMain.handle('models:list', () => listModels(loadSettings()))

  // CLI run
  ipcMain.handle('run:start', (_e, projectId: unknown, sessionId: unknown, prompt: unknown, mode: unknown) => {
    if (!mainWindow) return { ok: false, error: 'No window' }
    const project = reqProject(projectId)
    const sid = reqNumber(sessionId, 'sessionId')
    const session = getSessionById(sid)
    if (!session || session.projectId !== project.id) {
      return { ok: false, error: 'Session does not belong to this project' }
    }
    const promptText = reqString(prompt, 'prompt')
    const agentMode = reqAgentMode(mode)
    const settings = loadSettings()

    addMessage(sid, 'user', promptText)
    takeSnapshot(project.path)

    const win = mainWindow
    return startRun(win, project.id, project.path, promptText, settings, agentMode, session.opencodeSessionId, {
      onOpencodeSessionId: (ocId) => setSessionOpencodeId(sid, ocId),
      onFinished: (assistantText, status, _exitCode, message) => {
        if (assistantText) addMessage(sid, 'assistant', assistantText)
        if (status !== 'completed') addMessage(sid, 'system', message ?? `Run ${status}`)
      }
    })
  })
  ipcMain.handle('run:stop', (_e, projectId: unknown) => stopRun(reqNumber(projectId, 'projectId')))
  ipcMain.handle('run:isRunning', (_e, projectId: unknown) => isRunning(reqNumber(projectId, 'projectId')))

  // File changes / diff
  ipcMain.handle('files:changes', (_e, projectId: unknown) => detectChanges(reqProject(projectId).path))
  ipcMain.handle('files:diff', (_e, projectId: unknown, filePath: unknown) => {
    const project = reqProject(projectId)
    return getDiff(project.path, reqPathInside(project.path, filePath))
  })
  ipcMain.handle('files:read', (_e, projectId: unknown, filePath: unknown) => {
    const project = reqProject(projectId)
    return readFileContent(reqPathInside(project.path, filePath))
  })
}

app.whenReady().then(() => {
  initDb()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => stopAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
