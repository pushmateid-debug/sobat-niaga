importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Inisialisasi Firebase di dalam Service Worker
firebase.initializeApp({
    apiKey: "AIzaSyCp8Rjx2SuTxNabf51uFjmKHwbJyBgU7Ps", 
    authDomain: "sobatniaga.firebaseapp.com",
    databaseURL: "https://sobatniaga-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "sobatniaga",
    storageBucket: "sobatniaga.firebasestorage.app",
    messagingSenderId: "198089863049",
    appId: "1:198089863049:web:15db89ba8985b802ae7b58"
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