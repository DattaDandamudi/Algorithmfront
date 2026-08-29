import type { ReactElement } from 'react';
import type { GlyphKey } from '../../features/catalog/types';

/**
 * TrueFare's food illustration language: flat, rounded, warm — drawn on a
 * 100×100 grid. Every dish in the app is depicted by one of these glyphs
 * composed over a seeded organic blob (see FoodImage). One style, whole app.
 */

// Illustration palette — intentionally fixed (illustrations behave like
// photography: they keep their own warm light in dark mode too).
const C = {
  cream: '#FFF8EC',
  paper: '#FFFDF8',
  espresso: '#4A3728',
  cocoa: '#8B5E3C',
  terracotta: '#C4502F',
  red: '#B33A2B',
  saffron: '#E8A33D',
  gold: '#D98E2B',
  sage: '#7A8450',
  leaf: '#4C5A38',
  blushPink: '#E8A088',
  butter: '#F5D78E',
};

const shadow = <ellipse cx="50" cy="82" rx="28" ry="5" fill="rgba(60,42,26,0.12)" />;

export const FOOD_GLYPHS: Record<GlyphKey, ReactElement> = {
  bowl: (
    <g>
      {shadow}
      <path d="M20 48a30 30 0 0 0 60 0z" fill={C.terracotta} />
      <path d="M27 60h46a30 30 0 0 1-46 0z" fill={C.red} opacity="0.5" />
      <ellipse cx="50" cy="48" rx="30" ry="7" fill={C.saffron} />
      <ellipse cx="38" cy="47" rx="7" ry="3.4" fill={C.sage} />
      <ellipse cx="57" cy="45.5" rx="6" ry="3" fill={C.leaf} />
      <ellipse cx="63" cy="49" rx="5" ry="2.6" fill={C.cream} />
      <rect x="42" y="76" width="16" height="4" rx="2" fill={C.espresso} opacity="0.5" />
    </g>
  ),
  burger: (
    <g>
      {shadow}
      <path d="M24 44a26 18 0 0 1 52 0v2H24z" fill={C.gold} />
      <circle cx="40" cy="34" r="1.6" fill={C.cream} />
      <circle cx="50" cy="31" r="1.6" fill={C.cream} />
      <circle cx="60" cy="34" r="1.6" fill={C.cream} />
      <path d="M24 48h52c0 3-2 5-5 5H29c-3 0-5-2-5-5z" fill={C.sage} />
      <path d="M26 53h48l-3 6H29z" fill={C.butter} />
      <rect x="24" y="59" width="52" height="8" rx="4" fill={C.cocoa} />
      <rect x="26" y="67" width="48" height="9" rx="4.5" fill={C.gold} />
    </g>
  ),
  pizza: (
    <g>
      {shadow}
      <path d="M50 78 22 30a52 52 0 0 1 56 0z" fill={C.butter} />
      <path d="M22 30a52 52 0 0 1 56 0l-3.4 5.8a45 45 0 0 0-49.2 0z" fill={C.gold} />
      <circle cx="45" cy="45" r="4.5" fill={C.red} />
      <circle cx="58" cy="52" r="4" fill={C.red} />
      <circle cx="49" cy="62" r="3.6" fill={C.red} />
      <path d="M38 52c2-1 4 0 4 2" stroke={C.sage} strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  ),
  sushi: (
    <g>
      {shadow}
      <rect x="20" y="52" width="28" height="14" rx="7" fill={C.paper} />
      <path d="M22 52c3-6 21-6 24 0l-2 4H24z" fill={C.blushPink} />
      <path d="M23 51.5c3-4.5 19-4.5 22 0" stroke={C.terracotta} strokeWidth="1.4" fill="none" />
      <circle cx="66" cy="55" r="12" fill={C.espresso} />
      <circle cx="66" cy="55" r="8" fill={C.paper} />
      <circle cx="66" cy="55" r="3.6" fill={C.sage} />
      <rect x="30" y="34" width="34" height="3.4" rx="1.7" fill={C.cocoa} transform="rotate(-8 47 36)" />
    </g>
  ),
  ramen: (
    <g>
      {shadow}
      <path d="M18 46a32 32 0 0 0 64 0z" fill={C.red} />
      <ellipse cx="50" cy="46" rx="32" ry="7" fill={C.butter} />
      <path d="M28 44q4 3 8 0t8 0 8 0 8 0 8 0" stroke={C.gold} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <ellipse cx="62" cy="43" rx="6.5" ry="4.5" fill={C.paper} />
      <circle cx="62" cy="43" r="2.2" fill={C.saffron} />
      <rect x="34" y="41" width="4" height="8" rx="2" fill={C.sage} />
      <rect x="52" y="22" width="30" height="3" rx="1.5" fill={C.cocoa} transform="rotate(24 67 23)" />
      <rect x="55" y="18" width="30" height="3" rx="1.5" fill={C.cocoa} transform="rotate(28 70 19)" />
    </g>
  ),
  taco: (
    <g>
      {shadow}
      <path d="M20 70a30 30 0 0 1 60 0z" fill={C.gold} />
      <path d="M26 70a24 24 0 0 1 48 0z" fill={C.saffron} />
      <path d="M30 70q3-8 8-6t6 6z" fill={C.cocoa} />
      <path d="M42 70q3-9 8-7t7 7z" fill={C.sage} />
      <path d="M55 70q3-8 8-6t6 6z" fill={C.red} />
      <circle cx="46" cy="64" r="1.6" fill={C.cream} />
      <circle cx="58" cy="63" r="1.6" fill={C.cream} />
    </g>
  ),
  burrito: (
    <g>
      {shadow}
      <rect x="18" y="46" width="64" height="26" rx="13" fill={C.gold} />
      <path d="M18 59a13 13 0 0 0 13 13h-2a11 11 0 0 1 0-26h2a13 13 0 0 0-13 13z" fill={C.butter} />
      <ellipse cx="74" cy="59" rx="7" ry="12" fill={C.butter} />
      <path d="M70 51q3 2 0 4m2 3q3 2 0 4" stroke={C.sage} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M34 46q4 6 0 12t0 14" stroke={C.saffron} strokeWidth="2" fill="none" opacity="0.7" />
      <path d="M48 46q4 6 0 12t0 14" stroke={C.saffron} strokeWidth="2" fill="none" opacity="0.7" />
    </g>
  ),
  coffee: (
    <g>
      {shadow}
      <ellipse cx="50" cy="78" rx="24" ry="4" fill={C.cream} opacity="0.7" />
      <path d="M28 40h38v20a19 16 0 0 1-38 0z" fill={C.paper} />
      <path d="M66 44h6a7 7 0 0 1 0 14h-6v-5h5a2.5 2.5 0 0 0 0-5h-5z" fill={C.paper} />
      <ellipse cx="47" cy="40" rx="19" ry="5" fill={C.cocoa} />
      <ellipse cx="47" cy="40" rx="14" ry="3.4" fill={C.butter} opacity="0.85" />
      <path d="M40 20q-3 5 0 9m9-11q-3 5 0 9" stroke={C.cocoa} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.55" />
    </g>
  ),
  pancakes: (
    <g>
      {shadow}
      <ellipse cx="50" cy="70" rx="30" ry="8" fill={C.gold} />
      <ellipse cx="50" cy="62" rx="28" ry="8" fill={C.saffron} />
      <ellipse cx="50" cy="54" rx="26" ry="8" fill={C.gold} />
      <ellipse cx="50" cy="48" rx="26" ry="6" fill={C.cocoa} />
      <path d="M32 49q2 6 6 3m10 4q1 5 5 3m10-7q2 6 5 2" stroke={C.cocoa} strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="44" y="38" width="12" height="8" rx="2" fill={C.butter} />
    </g>
  ),
  croissant: (
    <g>
      {shadow}
      <path d="M22 62q-6-10 6-16 6 14 10 18z" fill={C.gold} />
      <path d="M78 62q6-10-6-16-6 14-10 18z" fill={C.gold} />
      <path d="M32 64q-4-14 18-16t18 16q-8 8-18 8t-18-8z" fill={C.saffron} />
      <path d="M40 50q-2 9 2 16m16-16q2 9-2 16" stroke={C.gold} strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  ),
  sandwich: (
    <g>
      {shadow}
      <path d="M24 40h52a4 4 0 0 1 0 8H24a4 4 0 0 1 0-8z" fill={C.gold} />
      <path d="M24 48h52c0 3-2 4-4 4H28c-2 0-4-1-4-4z" fill={C.sage} />
      <rect x="24" y="52" width="52" height="6" rx="3" fill={C.blushPink} />
      <path d="M24 58h52c0 3-2 4-4 4H28c-2 0-4-1-4-4z" fill={C.butter} />
      <rect x="22" y="62" width="56" height="9" rx="4.5" fill={C.saffron} />
      <circle cx="64" cy="38" r="2" fill={C.cream} />
    </g>
  ),
  salad: (
    <g>
      {shadow}
      <path d="M20 52a30 26 0 0 0 60 0z" fill={C.paper} />
      <path d="M30 50q-2-12 8-14 2 8 8 10z" fill={C.sage} />
      <path d="M54 46q0-12 12-10-1 9 4 14z" fill={C.leaf} />
      <path d="M42 48q2-8 10-6t6 8z" fill={C.sage} />
      <circle cx="38" cy="49" r="3" fill={C.red} />
      <circle cx="60" cy="50" r="3" fill={C.red} />
      <circle cx="49" cy="51" r="2.4" fill={C.saffron} />
    </g>
  ),
  curry: (
    <g>
      {shadow}
      <path d="M22 50h56v6a24 20 0 0 1-56 0z" fill={C.espresso} />
      <path d="M14 50h10v5H14zm62 0h10v5H76z" fill={C.espresso} />
      <ellipse cx="50" cy="50" rx="28" ry="6" fill={C.gold} />
      <ellipse cx="42" cy="49" rx="6" ry="3" fill={C.terracotta} />
      <ellipse cx="58" cy="50" rx="5" ry="2.6" fill={C.cream} />
      <path d="M44 28q-3 5 0 9m12-9q-3 5 0 9" stroke={C.cocoa} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.5" />
    </g>
  ),
  drumstick: (
    <g>
      {shadow}
      <path d="M30 36a22 22 0 1 1 14 38q-8 2-12-4t-6-12a22 22 0 0 1 4-22z" fill={C.gold} transform="rotate(14 50 50)" />
      <path d="M38 44a14 14 0 0 1 20 16" stroke={C.saffron} strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.7" />
      <rect x="24" y="66" width="18" height="5" rx="2.5" fill={C.paper} transform="rotate(-32 33 68)" />
      <circle cx="22" cy="76" r="4" fill={C.paper} />
      <circle cx="29" cy="80" r="4" fill={C.paper} />
    </g>
  ),
  wings: (
    <g>
      {shadow}
      <path d="M26 56q-4-12 8-14t16 6q-4 10-12 12t-12-4z" fill={C.terracotta} />
      <path d="M52 62q0-12 12-12t12 8q-2 10-11 11t-13-7z" fill={C.red} />
      <path d="M36 48q4-2 8 1" stroke={C.saffron} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M60 56q4-2 8 1" stroke={C.saffron} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M46 70q1 4-2 6" stroke={C.red} strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </g>
  ),
  icecream: (
    <g>
      {shadow}
      <path d="M38 52 50 82 62 52z" fill={C.gold} />
      <path d="M40 52l4 10h12l4-10z" fill={C.saffron} opacity="0.5" />
      <circle cx="43" cy="44" r="10" fill={C.blushPink} />
      <circle cx="57" cy="44" r="10" fill={C.cream} />
      <circle cx="50" cy="36" r="9" fill={C.cocoa} />
      <circle cx="50" cy="25" r="3.4" fill={C.red} />
    </g>
  ),
  cake: (
    <g>
      {shadow}
      <path d="M28 74 46 40l26 20-6 14z" fill={C.blushPink} />
      <path d="M28 74l18-34 5 4-17 32z" fill={C.cream} />
      <path d="M46 40l26 20-3 7-26-20z" fill={C.terracotta} opacity="0.35" />
      <circle cx="52" cy="34" r="3.6" fill={C.red} />
      <path d="M52 30q0-4 3-5" stroke={C.leaf} strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  ),
  dumpling: (
    <g>
      {shadow}
      <path d="M26 62a16 13 0 0 1 28 0q-6 6-14 6t-14-6z" fill={C.cream} />
      <path d="M30 52q2-5 4-1m4-4q2-5 4-1m4-3q2-5 4-1" stroke={C.gold} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M52 66a14 11 0 0 1 24 0q-5 5-12 5t-12-5z" fill={C.paper} />
      <path d="M58 58q2-4 3.4-.6m4-3q2-4 3.4-.6" stroke={C.gold} strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="66" cy="40" rx="9" ry="4.4" fill={C.espresso} />
      <ellipse cx="66" cy="39" rx="9" ry="3.6" fill={C.cocoa} />
    </g>
  ),
  noodles: (
    <g>
      {shadow}
      <path d="M24 56q6-14 26-14t26 14q-8 12-26 12T24 56z" fill={C.butter} />
      <path d="M30 52q5 6 10 0t10 0 10 0 10 0" stroke={C.gold} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M34 60q5 5 8 0t8 0 8 0 6 0" stroke={C.gold} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.7" />
      <rect x="54" y="18" width="34" height="3" rx="1.5" fill={C.cocoa} transform="rotate(30 71 19)" />
      <path d="M62 30q-4 10-10 14" stroke={C.butter} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="56" r="2.6" fill={C.sage} />
      <circle cx="60" cy="58" r="2.6" fill={C.terracotta} />
    </g>
  ),
  skewer: (
    <g>
      {shadow}
      <rect x="47.4" y="14" width="5.2" height="66" rx="2.6" fill={C.cocoa} />
      <rect x="36" y="24" width="28" height="14" rx="7" fill={C.terracotta} />
      <rect x="38" y="42" width="24" height="12" rx="6" fill={C.sage} />
      <rect x="36" y="58" width="28" height="14" rx="7" fill={C.red} />
      <path d="M42 28q6-2 12 0" stroke={C.saffron} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M42 62q6-2 12 0" stroke={C.saffron} strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  ),
  toast: (
    <g>
      {shadow}
      <path d="M26 34h48a6 6 0 0 1 6 6v32H20V40a6 6 0 0 1 6-6z" fill={C.gold} />
      <path d="M26 40h48v26H26z" fill={C.butter} rx="4" />
      <path d="M32 50q6-8 14-4t4 12q-8 6-14 1t-4-9z" fill={C.sage} />
      <circle cx="60" cy="52" r="4.4" fill={C.saffron} />
      <circle cx="60" cy="52" r="2" fill={C.gold} />
      <path d="M34 62q8 3 16 0" stroke={C.leaf} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
    </g>
  ),
  soup: (
    <g>
      {shadow}
      <path d="M20 48a30 28 0 0 0 60 0z" fill={C.paper} />
      <ellipse cx="50" cy="48" rx="30" ry="7" fill={C.saffron} />
      <ellipse cx="44" cy="47" rx="6" ry="3" fill={C.gold} />
      <ellipse cx="60" cy="48" rx="5" ry="2.6" fill={C.sage} />
      <rect x="66" y="26" width="24" height="4" rx="2" fill={C.cocoa} transform="rotate(38 78 28)" />
      <path d="M42 26q-3 5 0 9m14-9q-3 5 0 9" stroke={C.cocoa} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.5" />
    </g>
  ),
  fries: (
    <g>
      {shadow}
      <rect x="40" y="22" width="6" height="30" rx="3" fill={C.butter} transform="rotate(-8 43 37)" />
      <rect x="48" y="18" width="6" height="34" rx="3" fill={C.saffron} />
      <rect x="56" y="22" width="6" height="30" rx="3" fill={C.butter} transform="rotate(8 59 37)" />
      <rect x="33" y="28" width="6" height="26" rx="3" fill={C.saffron} transform="rotate(-14 36 41)" />
      <rect x="62" y="28" width="6" height="26" rx="3" fill={C.saffron} transform="rotate(14 65 41)" />
      <path d="M30 46h40l-5 32H35z" fill={C.terracotta} />
      <path d="M33 52h34" stroke={C.red} strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  donut: (
    <g>
      {shadow}
      <circle cx="50" cy="52" r="26" fill={C.gold} />
      <path d="M24 52a26 26 0 0 1 52 0q0 3-3 4-8 4-12-2t-11 0-12 2-11-1q-3-1-3-3z" fill={C.blushPink} />
      <circle cx="50" cy="52" r="9" fill="rgba(60,42,26,0.18)" />
      <circle cx="50" cy="52" r="7" fill="#F7EEDB" />
      <rect x="36" y="42" width="5" height="2.2" rx="1.1" fill={C.cream} transform="rotate(20 38 43)" />
      <rect x="56" y="38" width="5" height="2.2" rx="1.1" fill={C.leaf} transform="rotate(-16 58 39)" />
      <rect x="64" y="46" width="5" height="2.2" rx="1.1" fill={C.terracotta} transform="rotate(24 66 47)" />
    </g>
  ),
  fish: (
    <g>
      {shadow}
      <path d="M22 54q14-18 40-14 10 2 16 10-6 8-16 10-26 4-40-6z" fill={C.blushPink} />
      <path d="M22 54q6-9 16-12-2 10 0 20-10-2-16-8z" fill={C.terracotta} opacity="0.6" />
      <path d="M74 44l10-8-2 14 2 12-10-8z" fill={C.terracotta} />
      <circle cx="36" cy="50" r="2.2" fill={C.espresso} />
      <path d="M50 44q4 8 0 16m10-15q3 7 0 14" stroke={C.paper} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7" />
    </g>
  ),
  wrap: (
    <g>
      {shadow}
      <path d="M26 66a14 14 0 0 1 14-14h34v10a14 14 0 0 1-14 14H30a4 4 0 0 1-4-4z" fill={C.gold} transform="rotate(-8 50 60)" />
      <ellipse cx="70" cy="50" rx="8" ry="11" fill={C.butter} transform="rotate(-8 70 50)" />
      <path d="M68 42q4 3 0 6m2 4q4 3 0 6" stroke={C.sage} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="72" cy="52" r="2" fill={C.red} />
      <path d="M34 58q6 8 16 8" stroke={C.saffron} strokeWidth="2" fill="none" opacity="0.7" strokeLinecap="round" />
    </g>
  ),
  cookie: (
    <g>
      {shadow}
      <path d="M76 50a26 26 0 1 1-14-23 8 8 0 0 0 8 10 8 8 0 0 0 6 13z" fill={C.gold} />
      <circle cx="40" cy="44" r="3.4" fill={C.espresso} />
      <circle cx="54" cy="58" r="3.8" fill={C.espresso} />
      <circle cx="38" cy="60" r="2.8" fill={C.espresso} />
      <circle cx="60" cy="42" r="2.4" fill={C.espresso} />
      <circle cx="48" cy="50" r="2.2" fill={C.cocoa} />
    </g>
  ),
  pie: (
    <g>
      {shadow}
      <path d="M20 56h60v6a10 10 0 0 1-10 10H30a10 10 0 0 1-10-10z" fill={C.gold} />
      <path d="M20 56q0-8 8-8h44q8 0 8 8-8 5-15-1t-15 1-15-1-15 1z" fill={C.saffron} />
      <path d="M30 48q2-6 6-2m8-3q2-6 6-2m8-2q2-6 6-2" stroke={C.terracotta} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M26 66h48" stroke={C.gold} strokeWidth="2" opacity="0.6" />
    </g>
  ),
  boba: (
    <g>
      {shadow}
      <path d="M32 34h36l-4 44a6 6 0 0 1-6 5H42a6 6 0 0 1-6-5z" fill="#F3E2C7" />
      <path d="M33 42h34l-1 10H34z" fill={C.blushPink} opacity="0.7" />
      <ellipse cx="50" cy="34" rx="19" ry="5" fill={C.cream} />
      <rect x="52" y="10" width="6" height="34" rx="3" fill={C.terracotta} transform="rotate(8 55 27)" />
      <circle cx="42" cy="74" r="3.4" fill={C.espresso} />
      <circle cx="51" cy="77" r="3.4" fill={C.espresso} />
      <circle cx="59" cy="73" r="3.4" fill={C.espresso} />
      <circle cx="46" cy="66" r="3" fill={C.espresso} opacity="0.85" />
    </g>
  ),
  egg: (
    <g>
      {shadow}
      <path d="M28 46q-4-16 12-20t26 2 8 22-14 20-24 0-8-24z" fill={C.paper} />
      <circle cx="52" cy="48" r="11" fill={C.saffron} />
      <circle cx="49" cy="45" r="3.4" fill={C.butter} opacity="0.9" />
      <circle cx="34" cy="38" r="1.4" fill={C.espresso} opacity="0.4" />
      <circle cx="66" cy="60" r="1.4" fill={C.espresso} opacity="0.4" />
    </g>
  ),
};
