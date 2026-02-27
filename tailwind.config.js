/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // Pastikan ini nge-scan semua file di src
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563EB', // Blue-600 (Electric Blue base)
        secondary: '#09090b', // Zinc-950 (Deep/Matte Black)
      }
    },
  },
  plugins: [],
}