// mobile-terminal service worker
// Handles server-side push events and notification clicks.

self.addEventListener('push', e => {
  const data  = e.data?.json() ?? {}
  const title = data.title ?? 'mobile-terminal'
  e.waitUntil(
    self.registration.showNotification(title, {
      body:      data.body ?? '',
      tag:       data.tag  ?? 'signal',
      renotify:  true,
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.startsWith(self.registration.scope))
      if (existing) return existing.focus()
      return clients.openWindow('/')
    })
  )
})
