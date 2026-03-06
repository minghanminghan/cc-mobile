import { useState, useEffect } from 'react'
import { loadSettings, saveSettings, SESSION_NAME_RE, type AppSettings, type TerminalProfile, type NotificationEvents } from '../lib/settings'
import { enablePush, disablePush } from '../lib/pushNotifications'

const PROFILE_LABELS: Record<TerminalProfile, string> = {
  default: 'Default (zinc-950)',
  ghostty: 'Ghostty (Tokyo Night)',
  kitty: 'Kitty (Catppuccin Mocha)',
  alacritty: 'Alacritty (Material Dark)',
  putty: 'PuTTY (classic green)',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">{children}</p>
}

function Divider() {
  return <div className="border-t border-gray-700 my-4" />
}

export default function Settings({
  isOpen,
  toggleOpen,
  onSettingsChange,
}: {
  isOpen: boolean
  toggleOpen: () => void
  onSettingsChange?: (s: AppSettings) => void
}) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)

  // Sync pushNotificationsEnabled with actual Notification.permission on open
  useEffect(() => {
    if (!isOpen) return
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted' && settings.pushNotificationsEnabled) {
      update('pushNotificationsEnabled', false)
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const pushSupported = 'Notification' in window && 'serviceWorker' in navigator
  const [pushBusy, setPushBusy] = useState(false)

  async function handlePushToggle() {
    if (pushBusy) return
    setPushBusy(true)
    try {
      if (settings.pushNotificationsEnabled) {
        await disablePush()
        update('pushNotificationsEnabled', false)
      } else {
        const granted = await enablePush()
        if (granted) update('pushNotificationsEnabled', true)
      }
    } finally {
      setPushBusy(false)
    }
  }

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const next = { ...settings, [key]: value }
    setSettings(next)
    saveSettings(next)
    onSettingsChange?.(next)
  }

  const installFlag = settings.notificationEvents === 'all' ? ' -s -- --events=all' : ''
  const installCmd = `curl -fsSL ${window.location.origin}/install.sh | bash${installFlag}`

  const [copied, setCopied] = useState(false)
  function copyInstall() {
    navigator.clipboard.writeText(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  return (
	<>
	{/* Backdrop */}
	<div className="fixed inset-0 bg-black/50 z-10" onClick={toggleOpen} />

	{/* Modal */}
	<div className="fixed z-20 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
		w-[min(500px,92vw)] max-h-[80vh] overflow-y-auto
		bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-700">

		{/* Header */}
		<div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 sticky top-0 bg-gray-900 z-10">
			<h2 className="text-base font-semibold">Settings</h2>
			<button
				onClick={toggleOpen}
				className="text-gray-400 hover:text-white transition-colors cursor-pointer"
				aria-label="Close"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		<div className="px-5 py-4 flex flex-col gap-1">

			{/* tmux session */}
			<SectionLabel>tmux session</SectionLabel>

			<div className="flex flex-col gap-3">
				{/* Session name */}
				<div>
					<label className="block text-sm text-gray-300 mb-1">Session name</label>
					<input
						type="text"
						value={settings.tmuxSessionName}
						onChange={e => {
							const v = e.target.value
							// Only save if valid; still update local display for UX
							const next = { ...settings, tmuxSessionName: v }
							setSettings(next)
							if (SESSION_NAME_RE.test(v)) {
								saveSettings(next)
								onSettingsChange?.(next)
							}
						}}
						placeholder="mobile-terminal"
						className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none ${
							SESSION_NAME_RE.test(settings.tmuxSessionName)
								? 'border-gray-700 focus:border-gray-500'
								: 'border-red-600 focus:border-red-500'
						}`}
					/>
					{!SESSION_NAME_RE.test(settings.tmuxSessionName) && (
						<p className="text-xs text-red-400 mt-1">Only letters, digits, <code>-</code> and <code>_</code> allowed (max 64 chars)</p>
					)}
				</div>

				{/* Checkboxes */}
				<div className="flex flex-col gap-2">
					{([
						['tmuxAttachIfExists', '-A', 'Attach to existing session if it already exists'],
						['tmuxDetachOthers',   '-D', 'Detach other clients when attaching'],
						['tmuxMouseMode',      'set -g mouse on', 'Enable mouse support (scroll, click, resize panes)'],
						['tmuxAllowPassthrough', 'set -g allow-passthrough on', 'Allow OSC passthrough (required for agent notifications)'],
					] as [keyof AppSettings, string, string][]).map(([key, flag, desc]) => (
						<label key={key} className="flex items-start gap-3 cursor-pointer">
							<input
								type="checkbox"
								checked={settings[key] as boolean}
								onChange={e => update(key, e.target.checked)}
								className="mt-0.5 accent-blue-500"
							/>
							<span className="text-sm">
								<code className="text-gray-300 text-xs">{flag}</code>
								<span className="block text-xs text-gray-500 mt-0.5">{desc}</span>
							</span>
						</label>
					))}
				</div>

				{/* Preview */}
				<div className="bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
					<p className="text-xs text-gray-500 mb-1">Generated command</p>
					<code className="text-xs text-emerald-400 font-mono break-all">
						{[
							'tmux new-session',
							settings.tmuxAttachIfExists ? '-A' : '',
							settings.tmuxDetachOthers ? '-D' : '',
							`-s ${SESSION_NAME_RE.test(settings.tmuxSessionName) ? settings.tmuxSessionName : '<invalid>'}`,
							settings.tmuxMouseMode ? '; set -g mouse on' : '',
							settings.tmuxAllowPassthrough ? '; set -g allow-passthrough on' : '',
						].filter(Boolean).join(' ')}
					</code>
				</div>
			</div>

			<Divider />

			{/* Notification frequency */}
			<SectionLabel>Agent notification frequency</SectionLabel>

			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-2">
					{(['stop-only', 'all'] as NotificationEvents[]).map(opt => (
						<label key={opt} className="flex items-start gap-3 cursor-pointer group">
							<input
								type="radio"
								name="notificationEvents"
								value={opt}
								checked={settings.notificationEvents === opt}
								onChange={() => update('notificationEvents', opt)}
								className="mt-0.5 accent-blue-500"
							/>
							<span className="text-sm">
								<span className="text-gray-200">{opt === 'stop-only' ? 'Stop only' : 'All events'}</span>
								<span className="block text-xs text-gray-500 mt-0.5">
									{opt === 'stop-only'
										? 'Notify when the agent finishes a task (recommended)'
										: 'Notify on task stop and every intermediate notification event'}
								</span>
							</span>
						</label>
					))}
				</div>

				<div>
					<p className="text-xs text-gray-500 mb-2">Re-run this on your remote server to apply the change:</p>
					<div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
						<code className="text-emerald-400 text-xs flex-1 break-all font-mono">{installCmd}</code>
						<button
							onClick={copyInstall}
							className={`flex-shrink-0 transition-colors cursor-pointer ${copied ? 'text-emerald-400' : 'text-gray-400 hover:text-gray-200'}`}
							aria-label="Copy"
						>
							{copied ? (
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
									<polyline points="20 6 9 17 4 12" />
								</svg>
							) : (
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
								</svg>
							)}
						</button>
					</div>
				</div>
			</div>

			<Divider />

			{/* Terminal profile */}
			<SectionLabel>Terminal UI profile</SectionLabel>

			<div>
				<select
					value={settings.terminalProfile}
					onChange={e => update('terminalProfile', e.target.value as TerminalProfile)}
					className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500 cursor-pointer"
				>
					{(Object.keys(PROFILE_LABELS) as TerminalProfile[]).map(p => (
						<option key={p} value={p}>{PROFILE_LABELS[p]}</option>
					))}
				</select>
				<p className="text-xs text-gray-500 mt-2">Applies on the next connection.</p>
			</div>

			<Divider />

			{/* Push notifications */}
			<SectionLabel>Push notifications</SectionLabel>

			{pushSupported ? (
				<div className="flex flex-col gap-3">
					<p className="text-xs text-gray-500 leading-relaxed">
						Get system notifications when agent tasks finish — even when this tab is in the background.
						{Notification.permission === 'denied' && (
							<span className="block mt-1 text-red-400">
								Permission blocked in browser settings. Reset site permissions to re-enable.
							</span>
						)}
					</p>
					<button
						onClick={handlePushToggle}
						disabled={pushBusy || Notification.permission === 'denied'}
						className={`w-full py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
							settings.pushNotificationsEnabled
								? 'bg-zinc-700 hover:bg-zinc-600 text-white'
								: 'bg-blue-600 hover:bg-blue-500 text-white'
						}`}
					>
						{pushBusy
							? 'Working…'
							: settings.pushNotificationsEnabled
								? 'Disable push notifications'
								: 'Enable push notifications'}
					</button>
				</div>
			) : (
				<p className="text-xs text-gray-500">Not supported in this browser.</p>
			)}

			<Divider />

			<button
				onClick={toggleOpen}
				className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-medium transition-colors cursor-pointer"
			>
				Save and Close
			</button>

		</div>
	</div>
	</>
  )
}
