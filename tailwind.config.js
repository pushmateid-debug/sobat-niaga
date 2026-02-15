/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // Pastikan ini nge-scan semua file di src
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4F46E5', // Indigo-600
        secondary: '#8B5CF6', // Violet-500
      }
    },
  },
  plugins: [],
}