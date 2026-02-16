import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import { ThemeProvider } from './context/ThemeContext';
import { db } from './config/firebase';
import { ref, onValue } from 'firebase/database';
import { WifiOff } from 'lucide-react';

function App() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Logic untuk update Favicon Browser secara Realtime
  useEffect(() => {
    const faviconRef = ref(db, 'admin/banners/favicon');
    const unsubscribe = onValue(faviconRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const url = typeof data === 'object' ? data.url : data;
        if (url) {
          let link = document.querySelector("link[rel~='icon']");
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = url;
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Monitor Status Internet (Realtime)
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <ThemeProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {isOffline && (
          <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-500 text-white text-xs font-bold text-center py-2 flex items-center justify-center gap-2 shadow-md animate-in slide-in-from-top-2">
            <WifiOff size={16} /> Koneksi Terputus. Cek internet kamu ya!
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;