/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta AxisGo — PREDOMINANTEMENTE AZUL (site + logo)
        paper: '#F4F7FB',
        surface: '#FFFFFF',
        ink: '#122238',
        muted: '#64748B',
        band: '#0B2545', // azul-marinho (fundo escuro)
        band2: '#07172E', // navy mais profundo (fim do gradiente)
        teal: '#1D5FA8', // (nome do token mantido) = AZUL principal (botões/ações)
        'teal-tint': '#E8F1FC',
        copper: '#2E86DE', // (nome mantido) = azul vivo (destaques/eyebrows)
        cyan: '#3B93E8', // azul claro/vivo (topo do gradiente)
        line: '#DBE4EF',
        pos: '#15805A',
        neg: '#C0392B',
      },
      fontFamily: {
        serif: ['Georgia', '"Iowan Old Style"', '"Times New Roman"', 'serif'],
        sans: ['ui-sans-serif', '-apple-system', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,37,69,.05), 0 10px 30px rgba(11,37,69,.08)',
      },
      maxWidth: {
        content: '1180px',
      },
    },
  },
  plugins: [],
}
