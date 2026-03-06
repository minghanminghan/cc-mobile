// Handles service worker registration, notification permission, and push subscription.

function relayBase(): string {
  return import.meta.env.VITE_ENVIRONMENT === 'dev'
    ? 'http://localhost:3001'
    : window.location.origin
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${relayBase()}/vapid-public-key`)
    if (!res.ok) return null
    const { publicKey } = await res.json()
    return publicKey ?? null
  } catch {
    return null
  }
}

/** Request permission and subscribe to push. Returns false if permission denied or unsupported. */
export async function enablePush(): Promise<boolean> {
  if (!('Notification' in window)) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const reg = await navigator.serviceWorker.ready

  // Try server-side push subscription (requires VAPID configured on relay).
  const vapidKey = await getVapidPublicKey()
  if (vapidKey) {
    try {
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      await fetch(`${relayBase()}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      })
    } catch {
      // Push subscription failed — in-tab notifications still work.
    }
  }

  return true
}

/** Unsubscribe from push and notify the relay. */
export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await fetch(`${relayBase()}/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {})
  await sub.unsubscribe()
}

/** Show a notification via the service worker (works when tab is backgrounded). */
export async function showLocalNotification(title: string, body: string, tag: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification(title, { body, tag, renotify: true })
}
