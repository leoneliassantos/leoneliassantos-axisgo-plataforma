/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F4F2EB',
        surface: '#FFFFFF',
        ink: '#16211D',
        muted: '#6C6A5E',
        band: '#123029',
        band2: '#0E241F',
        teal: '#0E6A5A',
        'teal-tint': '#E7F0EC',
        copper: '#A9743F',
        line: '#E2DDD1',
        pos: '#15734F',
        neg: '#B23A2E',
      },
      fontFamily: {
        serif: ['Georgia', '"Iowan Old Style"', '"Times New Roman"', 'serif'],
        sans: ['ui-sans-serif', '-apple-system', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(22,33,29,.05), 0 8px 24px rgba(22,33,29,.06)',
      },
      maxWidth: {
        content: '1180px',
      },
    },
  },
  plugins: [],
}
