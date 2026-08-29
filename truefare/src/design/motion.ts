import type { Transition, Variants } from 'motion/react';

/**
 * The app's spring vocabulary. Three tiers only — every animation in the
 * app picks one of these so motion feels like a single system.
 */
export const springs = {
  /** Buttons, chips, toggles, whileTap. ~0.3s, alive, no wobble. */
  snappy: { type: 'spring', stiffness: 400, damping: 25 } as Transition,
  /** Cards, reveals, list layout moves. */
  standard: { type: 'spring', stiffness: 260, damping: 20 } as Transition,
  /** Layout/layoutId transitions (winner ring, tab indicator). */
  layout: { type: 'spring', stiffness: 300, damping: 30 } as Transition,
  /** Hero text and large imagery. */
  gentle: { type: 'spring', stiffness: 120, damping: 18, mass: 1 } as Transition,
} as const;

/** Micro fades / color changes that shouldn't spring. */
export const microTween: Transition = { duration: 0.2, ease: 'easeOut' };

/** Staggered reveal parent — pair with `riseChild` on children. */
export const staggerParent: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

export const riseChild: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 260, damping: 24 },
  },
};

/** Page-level enter: fade + 4px rise. Never slide whole pages. */
export const pageEnter = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: 'easeOut' },
} as const;

/** Modal / toast presence. */
export const popPresence = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.98 },
  transition: springs.layout,
} as const;

export const pressable = {
  whileTap: { scale: 0.97 },
  transition: springs.snappy,
} as const;
