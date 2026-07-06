import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import type { ChatMessage, MessageRole, Project, Session } from '../shared/types'

let db: Database.Database

export function initDb(): void {
  const dbPath = path.join(app.getPath('userData'), 'opencode-desktop.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_opened_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Session',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

function rowToProject(r: any): Project {
  return { id: r.id, name: r.name, path: r.path, createdAt: r.created_at, lastOpenedAt: r.last_opened_at }
}

export function upsertProject(projectPath: string): Project {
  const name = path.basename(projectPath)
  db.prepare(
    `INSERT INTO projects (name, path) VALUES (?, ?)
     ON CONFLICT(path) DO UPDATE SET last_opened_at = datetime('now')`
  ).run(name, projectPath)
  return rowToProject(db.prepare('SELECT * FROM projects WHERE path = ?').get(projectPath))
}

export function listProjects(): Project[] {
  return db.prepare('SELECT * FROM projects ORDER BY last_opened_at DESC').all().map(rowToProject)
}

export function removeProject(id: number): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export function getOrCreateSession(projectId: number): Session {
  const row: any = db
    .prepare('SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(projectId)
  if (row) {
    return { id: row.id, projectId: row.project_id, title: row.title, createdAt: row.created_at }
  }
  const info = db.prepare('INSERT INTO sessions (project_id) VALUES (?)').run(projectId)
  return getSessionById(Number(info.lastInsertRowid))
}

function getSessionById(id: number): Session {
  const row: any = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  return { id: row.id, projectId: row.project_id, title: row.title, createdAt: row.created_at }
}

export function addMessage(sessionId: number, role: MessageRole, content: string): ChatMessage {
  const info = db
    .prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)')
    .run(sessionId, role, content)
  const row: any = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid)
  return { id: row.id, sessionId: row.session_id, role: row.role, content: row.content, createdAt: row.created_at }
}

export function listMessages(sessionId: number): ChatMessage[] {
  return db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC')
    .all(sessionId)
    .map((r: any) => ({ id: r.id, sessionId: r.session_id, role: r.role, content: r.content, createdAt: r.created_at }))
}

export function getSetting(key: string): string | undefined {
  const row: any = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row?.value
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value
  )
}
