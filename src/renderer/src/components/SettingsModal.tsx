import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type SandboxMode, type Settings } from '../../../shared/types'

interface Props {
  onClose: () => void
}

const SANDBOX_MODES: { value: SandboxMode; label: string; hint: string; danger?: boolean }[] = [
  { value: 'read-only', label: 'Read-only', hint: 'Agent may read files but not modify anything.' },
  { value: 'workspace-write', label: 'Workspace write', hint: 'Agent may modify files inside the project folder.' },
  {
    value: 'full-access',
    label: 'Full access',
    hint: 'Agent may run arbitrary commands and touch files outside the workspace. Use with care.',
    danger: true
  }
]

export function SettingsModal({ onClose }: Props): JSX.Element {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.loadSettings().then(setSettings)
  }, [])

  const update = (patch: Partial<Settings>): void => {
    setSettings((s) => ({ ...s, ...patch }))
    setSaved(false)
  }

  const save = async (): Promise<void> => {
    await window.api.saveSettings(settings)
    setSaved(true)
  }

  const sandbox = SANDBOX_MODES.find((m) => m.value === settings.sandboxMode)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Settings</h3>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <label className="field">
            <span>OpenCode CLI path</span>
            <input value={settings.cliPath} onChange={(e) => update({ cliPath: e.target.value })} placeholder="opencode" />
          </label>
          <label className="field">
            <span>Model</span>
            <input
              value={settings.model}
              onChange={(e) => update({ model: e.target.value })}
              placeholder="e.g. anthropic/claude-sonnet-5 (empty = CLI default)"
            />
          </label>
          <label className="field">
            <span>Provider</span>
            <input
              value={settings.provider}
              onChange={(e) => update({ provider: e.target.value })}
              placeholder="e.g. anthropic (empty = CLI default)"
            />
          </label>
          <label className="field">
            <span>Sandbox mode</span>
            <select
              value={settings.sandboxMode}
              onChange={(e) => update({ sandboxMode: e.target.value as SandboxMode })}
            >
              {SANDBOX_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {sandbox && (
            <div className={sandbox.danger ? 'sandbox-hint danger' : 'sandbox-hint'}>
              {sandbox.danger ? '⚠ ' : ''}
              {sandbox.hint}
            </div>
          )}
          <label className="field">
            <span>Default flags</span>
            <input
              value={settings.defaultFlags}
              onChange={(e) => update({ defaultFlags: e.target.value })}
              placeholder="extra CLI flags, e.g. --print-logs"
            />
          </label>
          <div className="settings-note">
            API keys are not stored by this app. Configure credentials via environment variables or the OpenCode CLI's
            own configuration (<code>opencode auth</code>).
          </div>
        </div>
        <div className="modal-footer">
          {saved && <span className="saved-hint">Saved ✓</span>}
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
