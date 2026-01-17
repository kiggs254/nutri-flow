const CACHE_NAME = 'nutriflow-portal-v2'; // Updated to clear old cache with API keys
const urlsToCache = [
  '/',
  '/index.html',
  // Note: Add other static assets like CSS, JS, images here if they are not loaded via importmap
];

// Install a service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Cache and return requests
self.addEventListener('fetch', event => {
  // Let the browser do its default thing
  // for non-GET requests.
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Prevent caching of Supabase API calls and backend API calls to ensure data is always fresh
  if (event.request.url.includes('supabase.co') || 
      event.request.url.includes('/api/ai/') ||
      event.request.url.includes('localhost:3000') ||
      event.request.url.includes('geminiService') ||
      event.request.url.includes('services/geminiService')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        return fetch(event.request).then(
          response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

// Update a service worker - Clear old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old cache versions (especially v1 with API keys)
          if (cacheWhitelist.indexOf(cacheName) === -1 || cacheName === 'nutriflow-portal-v1') {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Force clients to reload
      return self.clients.claim();
    })
  );
});

// Handle push notifications
self.addEventListener('push', event => {
  console.log('Push notification received:', event);
  
  let notificationData = {
    title: 'NutriTherapy Solutions',
    body: 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: {}
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = {
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        icon: payload.icon || notificationData.icon,
        badge: payload.badge || notificationData.badge,
        data: payload.data || notificationData.data,
        tag: payload.tag || undefined, // Group similar notifications
        requireInteraction: payload.requireInteraction || false,
        actions: payload.actions || []
      };
    } catch (e) {
      console.error('Error parsing push payload:', e);
      // Fallback to text if JSON parsing fails
      notificationData.body = event.data.text() || notificationData.body;
    }
  }

  const notificationOptions = {
    ...notificationData,
    vibrate: [200, 100, 200],
    timestamp: Date.now()
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationOptions)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('Notification clicked:', event);
  
  event.notification.close();

  const notificationData = event.notification.data || {};
  const action = event.action;

  // Handle action buttons if any
  if (action) {
    // Handle specific actions
    if (action === 'view') {
      // Open the app to the relevant page
      event.waitUntil(
        clients.openWindow(notificationData.url || '/')
      );
    } else if (action === 'dismiss') {
      // Just close the notification
      return;
    }
  } else {
    // Default click behavior - open the app
    const urlToOpen = notificationData.url || '/';
    
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then(clientList => {
        // Check if there's already a window open
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});

// Handle notification close (optional - for tracking)
self.addEventListener('notificationclose', event => {
  console.log('Notification closed:', event);
  // Could send analytics or update read status here
});
