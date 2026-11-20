// Push-уведомления: подключается к сервис-воркеру приложения (workbox importScripts).
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { title: 'ГСМ Контроль', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'ГСМ Контроль', {
      body: d.body || '',
      tag: d.tag,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: d.url || './' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of list) {
        if ('focus' in c) {
          await c.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
