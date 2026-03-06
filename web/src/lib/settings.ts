export type TerminalProfile = 'default' | 'ghostty' | 'kitty' | 'alacritty' | 'putty'
export type NotificationEvents = 'stop-only' | 'all'

export interface AppSettings {
  tmuxSessionName: string
  tmuxAttachIfExists: boolean      // -A
  tmuxDetachOthers: boolean        // -D
  tmuxMouseMode: boolean           // set -g mouse on
  tmuxAllowPassthrough: boolean    // set -g allow-passthrough on
  notificationEvents: NotificationEvents
  terminalProfile: TerminalProfile
  pushNotificationsEnabled: boolean
}

/** Only letters, digits, dash, underscore — safe for use as a tmux session name */
export const SESSION_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/

const SETTINGS_KEY = 'mobile-terminal-settings'

const defaults: AppSettings = {
  tmuxSessionName: 'mobile-terminal',
  tmuxAttachIfExists: true,
  tmuxDetachOthers: true,
  tmuxMouseMode: true,
  tmuxAllowPassthrough: true,
  notificationEvents: 'stop-only',
  terminalProfile: 'default',
  pushNotificationsEnabled: false,
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...defaults }
    const stored = JSON.parse(raw)
    // Boolean flags must default to true when missing (e.g. first load after adding new fields)
    return {
      ...defaults,
      ...stored,
      tmuxAttachIfExists:   stored.tmuxAttachIfExists   ?? true,
      tmuxDetachOthers:     stored.tmuxDetachOthers     ?? true,
      tmuxMouseMode:        stored.tmuxMouseMode        ?? true,
      tmuxAllowPassthrough: stored.tmuxAllowPassthrough ?? true,
    }
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save settings', e)
  }
}
