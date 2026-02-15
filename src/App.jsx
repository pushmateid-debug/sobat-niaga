import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import { ThemeProvider } from './context/ThemeContext';
import { db } from './config/firebase';
import { ref, onValue } from 'firebase/database';

function App() {
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

  return (
    <ThemeProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;