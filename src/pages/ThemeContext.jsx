import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // Cek localStorage dulu, kalau gak ada default ke 'light'
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('app-theme') || 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    // Hapus class lama
    root.classList.remove('light', 'dark');
    // Tambah class baru
    root.classList.add(theme);
    // Set attribute buat CSS selector [data-theme='dark']
    root.setAttribute('data-theme', theme);
    // Simpan ke memory
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);