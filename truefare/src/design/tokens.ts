/**
 * Design tokens mirrored as TS constants for places CSS variables can't
 * reach (canvas, inline SVG fills, motion values). Keep in sync with the
 * CSS variables in src/index.css.
 */

export const palette = {
  light: {
    ground: '#FAF6EF',
    surface: '#FFFDF8',
    ink: '#2B2119',
    muted: '#8A7A6A',
    terracotta: '#C4502F',
    sage: '#7A8450',
    savings: '#3D7A4A',
    saffron: '#E8A33D',
    blush: '#F3E0D3',
    pistachio: '#E7EAD9',
  },
  dark: {
    ground: '#191410',
    surface: '#241D17',
    ink: '#F2EAE0',
    muted: '#A6947F',
    terracotta: '#E07A52',
    sage: '#9BA86D',
    savings: '#5FA36C',
    saffron: '#F0B45C',
    blush: '#3A2E24',
    pistachio: '#333828',
  },
} as const;

/** Per-platform data accents (desaturated for the cream ground). */
export const platformColors = {
  doordash: { accent: '#E8452C', logo: '#FF3008', label: 'DoorDash', short: 'DD' },
  ubereats: { accent: '#12A65E', logo: '#06C167', label: 'Uber Eats', short: 'UE' },
  grubhub: { accent: '#E67A17', logo: '#FF8000', label: 'Grubhub', short: 'GH' },
  postmates: { accent: '#3A3430', logo: '#141414', label: 'Postmates', short: 'PM' },
} as const;

export type PlatformColorKey = keyof typeof platformColors;
