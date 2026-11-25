// Service Worker untuk Sobat Niaga - Offline-First & Aggressive Caching (Spotify-style)
const CACHE_NAME = 'sobatniaga-cache-v1';
const IMAGE_CACHE_NAME = 'sobatniaga-images-v1';

// Aset statis inti yang dicache saat install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Gagal cache beberapa aset statis saat install:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && name !== IMAGE_CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Jangan intercept request Firebase Realtime DB, Firestore, atau Auth Websockets/API
  if (
    url.origin.includes('firebaseio.com') ||
    url.origin.includes('firestore.googleapis.com') ||
    url.origin.includes('identitytoolkit.googleapis.com') ||
    url.origin.includes('securetoken.googleapis.com') ||
    request.method !== 'GET'
  ) {
    return;
  }

  // Strategi Cache First untuk Gambar (Cloudinary, Firebase Storage, Placeholder, Unsplash)
  const isImage = 
    request.destination === 'image' || 
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|gif|ico)$/i) ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('firebasestorage.app') ||
    url.hostname.includes('firebasestorage.googleapis.com');

  if (isImage) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          // Sajikan dari cache segera (Instant display seperti Spotify)
          // Sekaligus coba revalidate di background bila online
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
          }).catch(() => {});
          return cachedResponse;
        }

        // Jika belum ada di cache, ambil dari network dan simpan
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            // Jika offline dan gambar gagal, fallback ke cached response jika ada
            return cachedResponse || new Response('', { status: 408, headers: { 'Content-Type': 'image/svg+xml' } });
          });
      })
    );
    return;
  }

  // Strategi Stale-While-Revalidate untuk berkas app (JS, CSS, HTML)
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      // Kembalikan versi cache instan jika tersedia, atau tunggu network
      return cachedResponse || fetchPromise;
    })
  );
});
