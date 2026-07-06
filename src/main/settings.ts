import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import { getSetting, setSetting } from './db'

const SETTINGS_KEY = 'app-settings'

export function loadSettings(): Settings {
  const raw = getSetting(SETTINGS_KEY)
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // Migrate pre-approvalPolicy settings: only old 'full-access' maps to auto-approve.
    if (!parsed['approvalPolicy'] && typeof parsed['sandboxMode'] === 'string') {
      parsed['approvalPolicy'] = parsed['sandboxMode'] === 'full-access' ? 'auto' : 'ask'
      delete parsed['sandboxMode']
    }
    const merged = { ...DEFAULT_SETTINGS, ...parsed } as Settings
    if (merged.approvalPolicy !== 'auto') merged.approvalPolicy = 'ask'
    if (merged.agentMode !== 'plan') merged.agentMode = 'build'
    return merged
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): Settings {
  setSetting(SETTINGS_KEY, JSON.stringify(settings))
  return settings
}
