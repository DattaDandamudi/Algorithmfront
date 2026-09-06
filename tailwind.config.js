/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        // Health app (src/health) dark design system — see SPEC §0.
        hx: {
          base: '#0B0D0F',
          card: '#14181C',
          card2: '#1A2026',
          border: '#1E252B',
          green: '#16C784',
          yellow: '#F5A623',
          red: '#E5484D',
          neutral: '#7C8A97',
          blue: '#3B82F6',
          text: '#F2F5F7',
          text2: '#A9B4BE',
          muted: '#6B7883',
        },
      },
    },
  },
  plugins: [],
};
