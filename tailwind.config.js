/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          500: '#2578e8',
          600: '#1c61c7'
        },
        mint: {
          500: '#14b8a6'
        }
      },
      boxShadow: {
        soft: '0 18px 60px rgba(15, 23, 42, 0.12)'
      }
    }
  },
  plugins: []
};
