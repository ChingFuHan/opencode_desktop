# OpenCode Desktop

A Windows-first, Claude Desktop-style workspace for the [OpenCode CLI](https://opencode.ai). Manage multiple local projects, keep per-project chat sessions, run the OpenCode agent with live terminal output, and review file changes — all from one Electron app.

## Features

- **Project Manager** — add local project folders, recent projects are remembered, per-project sessions, file tree in the sidebar.
- **Chat Workspace** — prompt input, user / assistant / system message history, persisted per project and reloaded on open.
- **OpenCode CLI Runtime** — spawns `opencode run` via Node `child_process` with the project folder as working directory, streams stdout/stderr live, one agent process per project, Stop button kills the whole process tree.
- **Terminal / Log Panel** — xterm.js panel with live stdout/stderr for the current session.
- **File Changes / Diff** — snapshot of the workspace is taken when a run starts; after the run, added/modified/deleted files are listed and viewable in a Monaco side-by-side diff.
- **Settings** — CLI path, model, provider, sandbox mode (read-only / workspace-write / full-access with danger warning), default flags. Persisted in SQLite. **API keys are never stored by this app** — use environment variables or `opencode auth`.

## Tech stack

Electron + React + TypeScript, built with [electron-vite](https://electron-vite.org). Persistence via better-sqlite3, terminal via @xterm/xterm, diffs via Monaco Editor.

```
src/
  main/       Electron main process (window, IPC, CLI runner, SQLite, file snapshots)
    index.ts    app entry + IPC registration
    cli.ts      opencode child_process lifecycle (start/stream/stop)
    db.ts       SQLite schema + queries (projects, sessions, messages, settings)
    files.ts    file tree, workspace snapshot, change detection, diff content
    settings.ts settings load/save
  preload/    contextBridge API exposed to the renderer (window.api)
  renderer/   React UI (sidebar, chat, terminal, changes/diff, settings modal)
  shared/     types shared across processes
```

## Prerequisites

- Windows 10 / 11
- Node.js 20+ (tested with 22)
- OpenCode CLI installed and on PATH: `npm i -g opencode-ai` (verify with `opencode --version`)
- OpenCode credentials configured via `opencode auth login` or provider environment variables (e.g. `ANTHROPIC_API_KEY`)

## Install & run

```powershell
npm install        # also rebuilds better-sqlite3 for Electron
npm run dev        # development with HMR
```

## Build / package

```powershell
npm run typecheck  # TS check for main + renderer
npm run build      # production build into out/
npm run start      # preview the production build
npm run dist       # Windows installer (NSIS) into release/
```

## OpenCode CLI configuration

Open **Settings (⚙)** in the app:

| Setting | Meaning |
| --- | --- |
| CLI path | Command or full path to `opencode` (default: `opencode` from PATH) |
| Model | Passed as `--model` to `opencode run` (empty = CLI default) |
| Provider | Provider hint (empty = CLI default) |
| Sandbox mode | read-only / workspace-write / full-access (full-access shows a danger warning) |
| Default flags | Extra flags appended to every `opencode run` invocation |

The app runs prompts as:

```powershell
opencode run [--model <model>] [default flags] "<your prompt>"
```

with the selected project folder as the working directory.

## Notes / roadmap

- One agent process per project at a time; multi-session parallel runs are a future extension.
- File-change detection is snapshot-based (mtime/size); the architecture leaves room for a proper git-backed diff later.
- macOS/Linux packaging intentionally not configured yet (Windows-first).
