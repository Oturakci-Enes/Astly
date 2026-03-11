/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        astra: {
          bg: 'var(--astra-bg)',
          surface: 'var(--astra-surface)',
          card: 'var(--astra-card)',
          border: 'var(--astra-border)',
          muted: 'var(--astra-muted)',
          text: 'var(--astra-text)',
          'text-muted': 'var(--astra-text-muted)',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#818cf8',
          light: '#a5b4fc',
        },
        gold: {
          DEFAULT: '#f59e0b',
          light: '#fcd34d',
          dark: '#d97706',
        },
        success: {
          DEFAULT: '#22c55e',
          light: '#86efac',
          dark: '#16a34a',
        },
        danger: {
          DEFAULT: '#ef4444',
          light: '#fca5a5',
          dark: '#dc2626',
        },
        warning: {
          DEFAULT: '#eab308',
          light: '#fde047',
          dark: '#ca8a04',
        },
        info: {
          DEFAULT: '#3b82f6',
          light: '#93c5fd',
          dark: '#2563eb',
        },
        purple: {
          DEFAULT: '#a78bfa',
          light: '#c4b5fd',
          dark: '#7c3aed',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        astra: '0 4px 24px rgba(0,0,0,0.4)',
        'astra-lg': '0 8px 40px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
}
