/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Ini bagian paling penting!
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Nunito Sans"', 'sans-serif'],
        price: ['"Montserrat"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}