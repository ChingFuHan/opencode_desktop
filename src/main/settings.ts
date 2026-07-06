import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import { getSetting, setSetting } from './db'

const SETTINGS_KEY = 'app-settings'

export function loadSettings(): Settings {
  const raw = getSetting(SETTINGS_KEY)
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): Settings {
  setSetting(SETTINGS_KEY, JSON.stringify(settings))
  return settings
}
