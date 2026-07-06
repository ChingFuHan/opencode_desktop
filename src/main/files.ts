import fs from 'node:fs'
import path from 'node:path'
import type { DiffContent, FileChange, FileNode } from '../shared/types'

const IGNORED = new Set(['node_modules', '.git', 'out', 'dist', 'release', '.next', 'build', '__pycache__'])
const MAX_TREE_DEPTH = 6
const MAX_SNAPSHOT_FILE_SIZE = 200 * 1024
const MAX_SNAPSHOT_FILES = 3000

export function readTree(dir: string, depth = 0): FileNode[] {
  if (depth >= MAX_TREE_DEPTH) return []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => !IGNORED.has(e.name))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map((e) => {
      const full = path.join(dir, e.name)
      const node: FileNode = { name: e.name, path: full, isDirectory: e.isDirectory() }
      if (e.isDirectory()) node.children = readTree(full, depth + 1)
      return node
    })
}

interface SnapshotEntry {
  mtimeMs: number
  size: number
  content: string | null
}

// One snapshot per project path, taken when a run starts.
const snapshots = new Map<string, Map<string, SnapshotEntry>>()

function walkFiles(dir: string, out: string[], depth = 0): void {
  if (depth >= MAX_TREE_DEPTH || out.length >= MAX_SNAPSHOT_FILES) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (IGNORED.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walkFiles(full, out, depth + 1)
    else if (e.isFile()) out.push(full)
    if (out.length >= MAX_SNAPSHOT_FILES) return
  }
}

function readTextIfSmall(file: string, size: number): string | null {
  if (size > MAX_SNAPSHOT_FILE_SIZE) return null
  try {
    const buf = fs.readFileSync(file)
    if (buf.includes(0)) return null // likely binary
    return buf.toString('utf8')
  } catch {
    return null
  }
}

export function takeSnapshot(projectPath: string): void {
  const files: string[] = []
  walkFiles(projectPath, files)
  const map = new Map<string, SnapshotEntry>()
  for (const f of files) {
    try {
      const st = fs.statSync(f)
      map.set(f, { mtimeMs: st.mtimeMs, size: st.size, content: readTextIfSmall(f, st.size) })
    } catch {
      /* skip */
    }
  }
  snapshots.set(projectPath, map)
}

export function detectChanges(projectPath: string): FileChange[] {
  const snap = snapshots.get(projectPath)
  if (!snap) return []
  const current: string[] = []
  walkFiles(projectPath, current)
  const currentSet = new Set(current)
  const changes: FileChange[] = []

  for (const f of current) {
    const prev = snap.get(f)
    if (!prev) {
      changes.push({ path: f, relativePath: path.relative(projectPath, f), status: 'added' })
      continue
    }
    try {
      const st = fs.statSync(f)
      if (st.mtimeMs !== prev.mtimeMs || st.size !== prev.size) {
        changes.push({ path: f, relativePath: path.relative(projectPath, f), status: 'modified' })
      }
    } catch {
      /* skip */
    }
  }
  for (const f of snap.keys()) {
    if (!currentSet.has(f)) {
      changes.push({ path: f, relativePath: path.relative(projectPath, f), status: 'deleted' })
    }
  }
  return changes
}

const EXT_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.css': 'css',
  '.html': 'html',
  '.md': 'markdown',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.yml': 'yaml',
  '.yaml': 'yaml'
}

export function getDiff(projectPath: string, filePath: string): DiffContent {
  const snap = snapshots.get(projectPath)
  const original = snap?.get(filePath)?.content ?? ''
  let modified = ''
  try {
    const st = fs.statSync(filePath)
    modified = readTextIfSmall(filePath, st.size) ?? '(binary or too large to display)'
  } catch {
    modified = '' // deleted
  }
  const language = EXT_LANG[path.extname(filePath).toLowerCase()] ?? 'plaintext'
  return { original, modified, language }
}

export function readFileContent(filePath: string): string {
  try {
    const st = fs.statSync(filePath)
    return readTextIfSmall(filePath, st.size) ?? '(binary or too large to display)'
  } catch (err) {
    return `(unable to read file: ${err})`
  }
}
