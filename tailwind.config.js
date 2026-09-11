/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // The health app (src/health): Figtree for interface and body, Bricolage
        // Grotesque for display and numerals (see src/health/DESIGN.md). The
        // Algoritm landing sets its own family on <body> in index.css.
        sans: ['Figtree', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Bricolage Grotesque', 'Figtree', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        tile: '20px',
        ctl: '14px',
      },
      colors: {
        // Health app (src/health) dark design system — see SPEC §0.
        hx: {
          // Health app dark design system — src/health/DESIGN.md. Names are
          // pinned by tests; values are the cold, blue-biased instrument set.
          base: '#070A0F',
          card: '#111820',
          card2: '#1A2433',
          border: '#233042',
          lume: '#E9F1FF',
          green: '#3DDC97',
          yellow: '#F5B451',
          red: '#F0566B',
          neutral: '#7D8BA0',
          blue: '#5B9CFF',
          text: '#E9F1FF',
          text2: '#A7B4C6',
          muted: '#8593A8',
        },
      },
    },
  },
  plugins: [],
};
