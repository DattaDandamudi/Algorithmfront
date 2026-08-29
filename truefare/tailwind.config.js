/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ground: 'rgb(var(--tf-ground) / <alpha-value>)',
        surface: 'rgb(var(--tf-surface) / <alpha-value>)',
        raised: 'rgb(var(--tf-raised) / <alpha-value>)',
        ink: 'rgb(var(--tf-ink) / <alpha-value>)',
        muted: 'rgb(var(--tf-muted) / <alpha-value>)',
        terracotta: 'rgb(var(--tf-terracotta) / <alpha-value>)',
        'terracotta-hover': 'rgb(var(--tf-terracotta-hover) / <alpha-value>)',
        'terracotta-press': 'rgb(var(--tf-terracotta-press) / <alpha-value>)',
        sage: 'rgb(var(--tf-sage) / <alpha-value>)',
        savings: 'rgb(var(--tf-savings) / <alpha-value>)',
        saffron: 'rgb(var(--tf-saffron) / <alpha-value>)',
        blush: 'rgb(var(--tf-blush) / <alpha-value>)',
        pistachio: 'rgb(var(--tf-pistachio) / <alpha-value>)',
        'plat-doordash': 'rgb(var(--tf-plat-doordash) / <alpha-value>)',
        'plat-ubereats': 'rgb(var(--tf-plat-ubereats) / <alpha-value>)',
        'plat-grubhub': 'rgb(var(--tf-plat-grubhub) / <alpha-value>)',
        'plat-postmates': 'rgb(var(--tf-plat-postmates) / <alpha-value>)',
      },
      borderColor: {
        hairline: 'var(--tf-hairline)',
      },
      borderRadius: {
        card: '24px',
        cell: '28px',
        control: '14px',
        pill: '999px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(60,42,26,0.06), 0 4px 8px rgba(60,42,26,0.05), 0 12px 24px rgba(60,42,26,0.05)',
        cardHover:
          '0 2px 4px rgba(60,42,26,0.08), 0 8px 16px rgba(60,42,26,0.08), 0 24px 48px rgba(60,42,26,0.10)',
        glassTop: 'inset 0 1px 0 rgba(255,255,255,0.25)',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        label: '0.08em',
      },
    },
  },
  plugins: [],
};
