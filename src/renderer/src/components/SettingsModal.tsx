import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type ApprovalPolicy, type Settings } from '../../../shared/types'

interface Props {
  models: string[]
  onClose: () => void
}

const APPROVAL_MODES: { value: ApprovalPolicy; label: string; hint: string; danger?: boolean }[] = [
  {
    value: 'ask',
    label: 'Ask (opencode default)',
    hint: "opencode's own permission config decides what needs approval. No extra flag is passed."
  },
  {
    value: 'auto',
    label: 'Auto-approve (--auto)',
    hint: 'Passes --auto: opencode auto-approves every permission not explicitly denied. Dangerous.',
    danger: true
  }
]

export function SettingsModal({ models, onClose }: Props): JSX.Element {
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

  const approval = APPROVAL_MODES.find((m) => m.value === settings.approvalPolicy)
  const providerFilter = settings.provider.trim().toLowerCase()
  const filteredModels = providerFilter
    ? models.filter((m) => m.toLowerCase().startsWith(providerFilter + '/'))
    : models

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
            <input
              value={settings.cliPath}
              onChange={(e) => update({ cliPath: e.target.value })}
              placeholder="opencode (or full path to opencode.exe)"
            />
          </label>
          <label className="field">
            <span>Provider filter</span>
            <input
              value={settings.provider}
              onChange={(e) => update({ provider: e.target.value })}
              placeholder="e.g. anthropic — filters the model list below"
            />
          </label>
          <label className="field">
            <span>Model (passed as --model)</span>
            <input
              value={settings.model}
              onChange={(e) => update({ model: e.target.value })}
              list="model-options"
              placeholder="provider/model (empty = CLI default)"
            />
            <datalist id="model-options">
              {filteredModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Permission approval</span>
            <select
              value={settings.approvalPolicy}
              onChange={(e) => update({ approvalPolicy: e.target.value as ApprovalPolicy })}
            >
              {APPROVAL_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {approval && (
            <div className={approval.danger ? 'sandbox-hint danger' : 'sandbox-hint'}>
              {approval.danger ? '⚠ ' : ''}
              {approval.hint}
            </div>
          )}
          <div className="settings-note">
            The opencode CLI has no read-only/workspace-write sandbox flags; file and command permissions are governed
            by opencode's own permission system (see <code>opencode.json</code> permissions config).
          </div>
          <label className="field">
            <span>Default flags</span>
            <input
              value={settings.defaultFlags}
              onChange={(e) => update({ defaultFlags: e.target.value })}
              placeholder="extra CLI flags appended to every run, e.g. --print-logs"
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
