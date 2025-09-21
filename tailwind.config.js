/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html','./src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        soft: '0 12px 40px rgba(0,0,0,0.35)'
      },
      colors: {
        bg: '#0b1220',
        card: '#0f1726',
        text: '#e5edff',
        muted: '#9bb0d3',
        accent: '#3b82f6',
      },
    },
  },
  plugins: [typography],
}