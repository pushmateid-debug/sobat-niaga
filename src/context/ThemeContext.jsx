import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({
  theme: 'light',
  toggleTheme: () => {},
});

export const useTheme = () => {
  return useContext(ThemeContext);
};

export const ThemeProvider = ({ children }) => {
  // 1. Cek localStorage dulu, kalau gak ada default ke 'light'
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    const root = window.document.documentElement;
    // 2. Update attribute data-theme di tag <html> agar CSS index.css jalan
    root.setAttribute('data-theme', theme);
    
    // FIX: Tambahkan class 'dark' juga agar kompatibel dengan Tailwind & request user
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // 3. Simpan preferensi user agar saat refresh tetap sama
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    console.log("✅ Fungsi toggleTheme di Context BERHASIL dipanggil! Mengubah tema...");
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};