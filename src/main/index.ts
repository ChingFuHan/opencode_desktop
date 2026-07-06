import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import {
  addMessage,
  getOrCreateSession,
  initDb,
  listMessages,
  listProjects,
  removeProject,
  upsertProject
} from './db'
import { loadSettings, saveSettings } from './settings'
import { isRunning, startRun, stopAll, stopRun } from './cli'
import { detectChanges, getDiff, readFileContent, readTree, takeSnapshot } from './files'
import type { Settings } from '../shared/types'

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

function registerIpc(): void {
  // Projects
  ipcMain.handle('project:selectFolder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return upsertProject(result.filePaths[0])
  })
  ipcMain.handle('project:list', () => listProjects())
  ipcMain.handle('project:open', (_e, projectPath: string) => upsertProject(projectPath))
  ipcMain.handle('project:remove', (_e, id: number) => removeProject(id))
  ipcMain.handle('project:tree', (_e, projectPath: string) => readTree(projectPath))

  // Sessions / messages
  ipcMain.handle('session:getOrCreate', (_e, projectId: number) => getOrCreateSession(projectId))
  ipcMain.handle('session:messages', (_e, sessionId: number) => listMessages(sessionId))
  ipcMain.handle('session:addMessage', (_e, sessionId: number, role, content: string) =>
    addMessage(sessionId, role, content)
  )

  // Settings
  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.handle('settings:save', (_e, settings: Settings) => saveSettings(settings))

  // CLI run
  ipcMain.handle('run:start', (_e, projectId: number, projectPath: string, prompt: string) => {
    if (!mainWindow) return { ok: false, error: 'No window' }
    const settings = loadSettings()
    takeSnapshot(projectPath)
    return startRun(mainWindow, projectId, projectPath, prompt, settings)
  })
  ipcMain.handle('run:stop', (_e, projectId: number) => stopRun(projectId))
  ipcMain.handle('run:isRunning', (_e, projectId: number) => isRunning(projectId))

  // File changes / diff
  ipcMain.handle('files:changes', (_e, projectPath: string) => detectChanges(projectPath))
  ipcMain.handle('files:diff', (_e, projectPath: string, filePath: string) => getDiff(projectPath, filePath))
  ipcMain.handle('files:read', (_e, filePath: string) => readFileContent(filePath))
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
