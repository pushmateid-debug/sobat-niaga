import React, { Component, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import ProductDetailPage from './pages/ProductDetailPage';
import PublicPreview from './pages/PublicPreview';
import Login from './pages/Login';
import { ThemeProvider } from './context/ThemeContext';
import { db } from './config/firebase';
import { ref, onValue } from 'firebase/database';
import { WifiOff } from 'lucide-react';

const FALLBACK_FAVICON = '/favicon.png';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('SobatNiaga rendering error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f8fafc', color: '#334155', fontFamily: 'sans-serif' }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h2 style={{ marginBottom: 8 }}>Halaman tidak dapat ditampilkan</h2>
            <p style={{ marginBottom: 20, color: '#64748b' }}>Terjadi kendala saat memuat tampilan. Silakan kembali atau muat ulang halaman.</p>
            <button type="button" onClick={() => window.location.assign('/')} style={{ border: 0, borderRadius: 12, padding: '12px 18px', background: '#0284c7', color: 'white', fontWeight: 700 }}>Ke Beranda</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Logic untuk update Favicon Browser secara Realtime
  useEffect(() => {
    let link = document.getElementById('app-favicon');
    if (!link) {
      link = document.createElement('link');
      link.id = 'app-favicon';
      link.rel = 'icon';
      link.href = '/api/favicon';
      document.head.appendChild(link);
    }
    const setFallbackFavicon = () => {
      link.type = 'image/png';
      link.href = FALLBACK_FAVICON;
    };
    link.onerror = () => {
      if (!link.href.endsWith(FALLBACK_FAVICON)) {
        setFallbackFavicon();
      }
    };

    const faviconRef = ref(db, 'admin/banners/favicon');
    const unsubscribe = onValue(faviconRef, (snap) => {
      const data = snap.exists() ? snap.val() : null;
      const url = typeof data === 'object' && data !== null ? data.url : data;
      if (!url || typeof url !== 'string') {
        setFallbackFavicon();
        return;
      }

      try {
        const faviconUrl = new URL(url);
        if (faviconUrl.protocol !== 'https:' || faviconUrl.hostname !== 'res.cloudinary.com') {
          setFallbackFavicon();
          return;
        }
        const cloudinaryPath = faviconUrl.pathname.match(/^\/([^/]+)\/image\/upload\/(.+)$/);
        if (!cloudinaryPath) {
          setFallbackFavicon();
          return;
        }
        const [, cloudName, publicId] = cloudinaryPath;
        const assetPath = publicId.replace(/^(q_auto,f_auto|c_fill,w_256,h_256,r_max,f_png)\//, '');
        faviconUrl.pathname = `/${cloudName}/image/upload/c_fill,w_256,h_256,r_max,f_png/${assetPath}`;
        faviconUrl.search = '';
        faviconUrl.hash = '';
        link.removeAttribute('type');
        link.href = faviconUrl.toString();
      } catch {
        setFallbackFavicon();
      }
    }, (error) => {
      console.error('Gagal memuat favicon dari Firebase:', error);
      setFallbackFavicon();
    });

    return () => {
      unsubscribe();
      link.onerror = null;
    };
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
    <AppErrorBoundary>
    <ThemeProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {isOffline && (
          <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-500 text-white text-xs font-bold text-center py-2 flex items-center justify-center gap-2 shadow-md animate-in slide-in-from-top-2">
            <WifiOff size={16} /> Koneksi Terputus. Cek internet kamu ya!
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/product/:id" element={<ProductDetailPage />} />
          <Route path="/demo" element={<PublicPreview />} />
          <Route path="/demo/dashboard" element={<PublicPreview />} />
          <Route path="/fitur" element={<PublicPreview />} />
          <Route path="/tentang" element={<PublicPreview />} />
        </Routes>
      </Router>
    </ThemeProvider>
    </AppErrorBoundary>
  );
}

export default App;