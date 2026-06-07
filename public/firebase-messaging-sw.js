importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Inisialisasi Firebase di dalam Service Worker
// Note: Masukkan config firebase kamu di sini
firebase.initializeApp({
    apiKey: "AIzaSy...", 
    authDomain: "sobat-niaga.firebaseapp.com",
    databaseURL: "https://sobat-niaga-default-rtdb.firebaseio.com",
    projectId: "sobat-niaga",
    storageBucket: "sobat-niaga.appspot.com",
    messagingSenderId: "...",
    appId: "..."
});

const messaging = firebase.messaging();

// Handle Background Messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Menerima pesan background ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png', // Ganti dengan path logo SobatNiaga kamu
    badge: '/logo192.png',
    data: {
        url: payload.data?.url || '/' // Link yang dibuka pas notif diklik
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle klik pada notifikasi
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url));
});