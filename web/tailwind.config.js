/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand MDA (MDA/carousels/BRAND.md)
        ink: '#0A0908',
        panel: '#141210',
        panel2: '#1D1A16',
        line: '#2A2621',
        gold: '#FFD300',
        good: '#37D67A',
        bad: '#FF6B6B',
        muted: '#8A8375',
        text: '#F5F1E8',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body: ['system-ui', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
