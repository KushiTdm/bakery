// public/sw.js
// Service Worker — Sauve Mie
// Gère : notifications push + cache offline basique

const CACHE_NAME = 'sauve-mie-v1';
const OFFLINE_URLS = [
  '/',
  '/boulanger',
];

// ── Installation ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS).catch(() => {
        // Silencieux si les URLs ne sont pas atteignables au SW install
      });
    })
  );
  // Active immédiatement sans attendre la fermeture des autres onglets
  self.skipWaiting();
});

// ── Activation ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  // Prend le contrôle de toutes les pages ouvertes immédiatement
  self.clients.claim();
});

// ── Fetch — stratégie Network First avec fallback cache ───────
self.addEventListener('fetch', (event) => {
  // Ne gérer que les requêtes GET de navigation (pas les API calls)
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('/api/') ||
    event.request.url.includes('supabase') ||
    event.request.url.includes('airtable')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Mise en cache des réponses OK uniquement
        if (response.ok && event.request.destination === 'document') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Fallback cache en cas de réseau indisponible
        return caches.match(event.request).then(
          (cached) => cached ?? caches.match('/')
        );
      })
  );
});

// ── Push Notifications ────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'Sauve Mie',
      body: event.data.text(),
    };
  }

  const options = {
    body:    payload.body    ?? 'Nouvelle notification',
    icon:    payload.icon    ?? '/icons/icon-192x192.png',
    badge:   payload.badge   ?? '/icons/badge-72x72.png',
    tag:     payload.tag     ?? 'bakery-notification',
    data:    { url: payload.url ?? '/boulanger' },
    actions: [
      { action: 'open',    title: 'Voir',    icon: '/icons/icon-192x192.png' },
      { action: 'dismiss', title: 'Ignorer'                                  },
    ],
    requireInteraction: payload.tag === 'commande', // Reste affiché pour les commandes
    silent: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Sauve Mie', options)
  );
});

// ── Clic sur notification ─────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action  = event.action;
  const url     = event.notification.data?.url ?? '/boulanger';

  if (action === 'dismiss') return;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Réutilise un onglet existant si possible
        for (const client of clientList) {
          if (client.url.includes('/boulanger') && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Sinon ouvre un nouvel onglet
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// ── Notification fermée ───────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  // Analytique éventuelle : notification fermée sans clic
  console.log('[SW] Notification fermée :', event.notification.tag);
});