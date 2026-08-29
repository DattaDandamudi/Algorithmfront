import { useMemo } from 'react';
import clsx from 'clsx';
import { createRng } from '../../lib/rng';
import type { GlyphKey } from '../../features/catalog/types';
import { FOOD_GLYPHS } from './FoodGlyphs';

/**
 * Every dish/restaurant visual in TrueFare: a seeded organic blob in a warm
 * tint with a hand-drawn glyph over it. Deterministic per seed, so the same
 * item always looks the same. Illustrations keep their warm light in dark
 * mode, the way photography would.
 */

const TINTS = [
  { bg: '#F6E7DA', blob: '#EFD3BC' }, // blush
  { bg: '#EAEDDC', blob: '#DCE2C5' }, // pistachio
  { bg: '#F7ECD2', blob: '#F0DDAE' }, // butter
  { bg: '#F2DED4', blob: '#E7C8B8' }, // clay
];

const BLOB_RADII = [
  '42% 58% 63% 37% / 45% 38% 62% 55%',
  '58% 42% 40% 60% / 55% 62% 38% 45%',
  '50% 50% 62% 38% / 60% 44% 56% 40%',
  '38% 62% 48% 52% / 48% 58% 42% 52%',
];

const DOT_COLORS = ['#C4502F', '#7A8450', '#E8A33D'];

interface FoodImageProps {
  glyph: GlyphKey;
  seed: string;
  className?: string;
  /** Accessible name; omit for purely decorative uses. */
  label?: string;
  /** Skip the settle-in animation (e.g. inside lists that animate anyway). */
  still?: boolean;
}

export function FoodImage({ glyph, seed, className, label, still }: FoodImageProps) {
  const v = useMemo(() => {
    const rng = createRng(`img:${seed}`);
    return {
      tint: TINTS[rng.int(0, TINTS.length - 1)],
      radius: BLOB_RADII[rng.int(0, BLOB_RADII.length - 1)],
      rot: rng.range(-7, 7),
      blobRot: rng.range(-24, 24),
      dot: {
        color: DOT_COLORS[rng.int(0, DOT_COLORS.length - 1)],
        top: rng.range(10, 24),
        left: rng.range(66, 84),
        size: rng.range(5, 9),
      },
      dot2: {
        top: rng.range(66, 84),
        left: rng.range(8, 20),
        size: rng.range(4, 7),
      },
    };
  }, [seed]);

  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={clsx('relative flex items-center justify-center overflow-hidden', className)}
      style={{ backgroundColor: v.tint.bg }}
    >
      <div
        className="absolute inset-[7%]"
        style={{
          backgroundColor: v.tint.blob,
          borderRadius: v.radius,
          transform: `rotate(${v.blobRot}deg)`,
        }}
      />
      <span
        className="absolute rounded-full opacity-70"
        style={{
          backgroundColor: v.dot.color,
          top: `${v.dot.top}%`,
          left: `${v.dot.left}%`,
          width: v.dot.size,
          height: v.dot.size,
        }}
      />
      <span
        className="absolute rounded-full opacity-50"
        style={{
          backgroundColor: '#8B5E3C',
          top: `${v.dot2.top}%`,
          left: `${v.dot2.left}%`,
          width: v.dot2.size,
          height: v.dot2.size,
        }}
      />
      <svg
        viewBox="0 0 100 100"
        className={clsx('relative h-[74%] w-[74%]', !still && 'img-settle')}
        style={{ transform: `rotate(${v.rot}deg)` }}
      >
        {FOOD_GLYPHS[glyph]}
      </svg>
    </div>
  );
}
