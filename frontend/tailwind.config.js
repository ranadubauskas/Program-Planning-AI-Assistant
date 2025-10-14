/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vanderbilt: {
          gold: '#CFAE70',
          black: '#212121'
        }
      }
    },
  },
  plugins: [],
}
