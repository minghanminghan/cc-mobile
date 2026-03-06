import { useState, useEffect } from 'react'
import { showLocalNotification } from '../lib/pushNotifications'
import { loadSettings } from '../lib/settings'

interface Signal {
  type: 'stop' | 'notify' | string
  tool?: string
  message?: string
}

interface Toast {
  id: number
  signal: Signal
}

let nextId = 0

function fire(signal: Signal) {
  window.dispatchEvent(new CustomEvent('MOBILE_TERMINAL_SIGNAL', { detail: signal }))
}

export default function SignalBanner() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handle = (e: Event) => {
      const signal = (e as CustomEvent<Signal>).detail
      const id = ++nextId
      setToasts(prev => [...prev, { id, signal }])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 5000)

      // Fire a system notification when the tab is not in focus.
      // Server-side push (relay) handles the fully-closed-tab case.
      if (
        loadSettings().pushNotificationsEnabled &&
        Notification.permission === 'granted' &&
        document.visibilityState !== 'visible'
      ) {
        const isStop   = signal.type === 'stop'
        const toolLabel = signal.tool ? ` · ${signal.tool}` : ''
        const title = isStop ? `Task complete${toolLabel}` : `Notification${toolLabel}`
        const body  = isStop ? '' : (signal.message ?? '')
        showLocalNotification(title, body, signal.type).catch(() => {})
      }
    }
    window.addEventListener('MOBILE_TERMINAL_SIGNAL', handle)
      // Console test helper: __signal__() or __signal__('notify', 'claude')
      ; (window as any).__signal__ = (type = 'stop', tool = 'test') => fire({ type, tool })
    return () => {
      window.removeEventListener('MOBILE_TERMINAL_SIGNAL', handle)
      delete (window as any).__signal__
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    // Use inset-x-0 + justify-center instead of left-1/2 -translate-x-1/2
    // to avoid Tailwind v4 transform quirks and overflow:hidden clipping on #root
    <div
      className="fixed inset-x-0 z-[9999] flex justify-center pointer-events-none"
      style={{ top: '48px' }}
    >
      <div className="flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map(({ id, signal }) => {
          const isStop = signal.type === 'stop'
          const toolLabel = signal.tool ? ` · ${signal.tool}` : ''
          return (
            <div
              key={id}
              className={`flex items-center gap-3 sm:gap-4 px-5 sm:px-6 py-3 sm:py-4 rounded-xl shadow-2xl text-base sm:text-lg font-medium pointer-events-auto whitespace-nowrap ${isStop
                  ? 'bg-emerald-900 text-emerald-100 border-2 border-emerald-700/60'
                  : 'bg-blue-900 text-blue-100 border-2 border-blue-700/60'
                }`}
            >
              {isStop ? (
                <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              )}
              <span>
                {isStop
                  ? `Task complete${toolLabel}`
                  : signal.message ?? `Notification${toolLabel}`}
              </span>
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== id))}
                className="ml-2 opacity-50 hover:opacity-100 transition-opacity cursor-pointer p-1"
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
