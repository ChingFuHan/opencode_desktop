# OpenCode Desktop

A Windows-first, Claude Desktop-style workspace for the [OpenCode CLI](https://opencode.ai). Manage multiple local projects, keep per-project chat sessions, run the OpenCode agent with live terminal output, and review file changes — all from one Electron app.

## Features

- **Project Manager** — add local project folders, recent projects are remembered, per-project sessions, file tree in the sidebar.
- **Chat Workspace** — prompt input, user / assistant / system message history, persisted per project and reloaded on open. Assistant replies stream live into the chat while the agent runs.
- **Plan / Build toggle** — switches the primary opencode agent: runs are invoked with `--agent plan` or `--agent build`, so the mode genuinely changes agent behavior (plan is opencode's read-only planning agent).
- **Model picker** — the model list comes from `opencode models` on your machine; the selection is passed as `--model provider/model` on every run (empty = CLI default).
- **Real session continuation** — the opencode session id (`ses_…`) is captured from the JSON event stream on the first run and passed back with `--session` on subsequent prompts, so each project continues one real opencode conversation. "New Session" starts a fresh one.
- **OpenCode CLI Runtime** — resolves the actual `opencode.exe` (following the npm `.cmd` shim) and spawns it with `shell: false` and a clean argv array, so prompts are never interpreted by a shell. Runs use `opencode run --format json`; events are rendered readably in the terminal panel and assistant text is extracted for the chat. Stop kills the whole Windows process tree (`taskkill /PID <pid> /T /F`).
- **Terminal / Log Panel** — xterm.js panel with live output for the current run (steps, tool events, token/cost summaries, stderr).
- **File Changes / Diff** — snapshot of the workspace is taken when a run starts; after the run, added/modified/deleted files are listed and viewable in a Monaco side-by-side diff.
- **Settings** — CLI path, provider filter, model, permission approval, default flags. Persisted in SQLite. **API keys are never stored by this app** — use environment variables or `opencode auth`.

## Security model

- `nodeIntegration: false`, `contextIsolation: true`; the renderer only reaches the main process through the `contextBridge` API in `src/preload`.
- Every IPC handler validates its arguments (types, ranges, enum values). Project paths are resolved from the database by id — the renderer never passes raw paths for project-scoped operations, and file read/diff requests are rejected if they resolve outside the project folder.
- The renderer cannot execute shell commands. The only process the app spawns from user input is the resolved `opencode.exe` with a fixed argument structure.

## Tech stack

Electron + React + TypeScript, built with [electron-vite](https://electron-vite.org). Persistence via better-sqlite3, terminal via @xterm/xterm, diffs via Monaco Editor.

```
src/
  main/       Electron main process (window, IPC, CLI runner, SQLite, file snapshots)
    index.ts    app entry + IPC registration + argument validation
    cli.ts      opencode child_process lifecycle (exe resolution, JSON event stream, stop, model list)
    db.ts       SQLite schema + queries (projects, sessions incl. opencode session id, messages, settings)
    files.ts    file tree, workspace snapshot, change detection, diff content
    settings.ts settings load/save + migration
  preload/    contextBridge API exposed to the renderer (window.api)
  renderer/   React UI (sidebar, chat + mode/model toolbar, terminal, changes/diff, settings modal)
  shared/     types shared across processes
```

## Prerequisites

- Windows 10 / 11
- Node.js 20+ (tested with 22)
- OpenCode CLI installed and on PATH: `npm i -g opencode-ai` (verify with `opencode --version`; tested against 1.17.14)
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
| CLI path | Command or full path to `opencode` / `opencode.exe` (default: `opencode` from PATH; the npm `.cmd` shim is resolved to the real `.exe` automatically) |
| Provider filter | Filters the model suggestion list (e.g. `anthropic`) |
| Model | Passed as `--model` to `opencode run` (empty = CLI default) |
| Permission approval | `Ask` (opencode's own permission config decides) or `Auto-approve` (passes `--auto`, dangerous) |
| Default flags | Extra flags appended to every `opencode run` invocation |

The app runs prompts as:

```powershell
opencode run --format json --agent <plan|build> [--model <model>] [--session <ses_…>] [--auto] [default flags] "<your prompt>"
```

with the selected project folder as the working directory.

## Honest limitations

- **No sandbox modes** — the opencode CLI has no read-only/workspace-write sandbox flags, so this app does not pretend to offer them. File/command permissions are governed by opencode's own permission system (`opencode.json`); the only knob the CLI exposes is `--auto`, surfaced as "Auto-approve" with a danger warning. The Plan agent is the closest thing to a read-only mode.
- **Permission prompts** — `opencode run` is non-interactive; if opencode's config requires an interactive approval, the run may wait or fail rather than pop up a dialog in this app. Use opencode's permission config (or Auto-approve, cautiously) for unattended runs.
- One agent process per project at a time; parallel runs per project are a future extension.
- File-change detection is snapshot-based (mtime/size); a git-backed diff is a natural upgrade path.
- macOS/Linux packaging intentionally not configured yet (Windows-first). The runtime adapter falls back to direct spawn on POSIX, but it is untested there.
