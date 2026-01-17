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
