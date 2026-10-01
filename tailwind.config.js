/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        darkGreen: '#16332c',
        darkerGreen: '#0f241f',
        beige: '#f5f2eb',
        cardBeige: '#efeae0',
        rust: '#b85441',
        rustHover: '#9e4635',
        gold: '#b8860b',
        softGreen: '#e3e8e1',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Merriweather', 'serif'],
      },
    },
  },
  plugins: [],
}
