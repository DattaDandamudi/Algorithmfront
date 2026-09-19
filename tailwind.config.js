/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // The health app (src/health): Archivo for display, numerals and every
        // interface word (its width axis is set through the type classes in
        // health.css), Literata for reading text (see src/health/DESIGN.md).
        // The Algoritm landing sets its own family on <body> in index.css.
        sans: ['Archivo', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Archivo', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        serif: ['Literata', 'Georgia', 'Times New Roman', 'serif'],
      },
      borderRadius: {
        // Radius is a tap signal: 0 on anything read, 4 px on chips, keys,
        // inputs and tags. Both resolve through the variables on .hx so the
        // existing radius usages update without any screen edits.
        tile: 'var(--hx-radius, 0px)',
        ctl: 'var(--hx-radius-sm, 4px)',
      },
      colors: {
        hx: {
          // Health app palette, the black-stock edition (src/health/DESIGN.md).
          // Names are pinned by tests; only the values moved.
          base: '#100E0B',
          card: '#181512',
          card2: '#221E1A',
          border: '#3D362F',
          lume: '#F7F1E5',
          green: '#7CC993',
          yellow: '#E2B14F',
          red: '#F2786F',
          neutral: '#A39B8F',
          blue: '#89B5EE',
          text: '#EDE6D8',
          text2: '#BDB4A4',
          muted: '#958C7D',
        },
      },
    },
  },
  plugins: [],
};
