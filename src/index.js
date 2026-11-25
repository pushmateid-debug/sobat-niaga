import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

// Registrasi Service Worker untuk Caching Instan & Mode Offline (Spotify-Style Caching)
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('ServiceWorker SobatNiaga aktif & siap cache:', reg.scope);
      })
      .catch((err) => {
        console.warn('Gagal registrasi ServiceWorker:', err);
      });
  });
} else if ('serviceWorker' in navigator && window.location.hostname === 'localhost') {
  // Aktifkan juga di localhost untuk testing responsif offline jika diperlukan
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('ServiceWorker dev aktif:', reg.scope);
      })
      .catch((err) => {
        console.warn('Gagal registrasi SW di localhost:', err);
      });
  });
}
