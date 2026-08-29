import clsx from 'clsx';
import { platformColors } from '../../design/tokens';
import type { Platform } from '../../features/catalog/types';

interface PlatformBadgeProps {
  platform: Platform;
  size?: 'sm' | 'md' | 'lg';
  /** Show only the logo dot + short code. */
  compact?: boolean;
  className?: string;
}

/**
 * Platform identity chip: full-saturation brand color lives ONLY in the
 * logo dot; the label sits in the desaturated data accent so competitor
 * brands never shout on the warm ground.
 */
export function PlatformBadge({ platform, size = 'md', compact, className }: PlatformBadgeProps) {
  const c = platformColors[platform];
  return (
    <span
      className={clsx(
        'inline-flex items-center font-semibold',
        size === 'sm' && 'gap-1.5 text-[12px]',
        size === 'md' && 'gap-2 text-[14px]',
        size === 'lg' && 'gap-2.5 text-[17px]',
        className
      )}
      style={{ color: 'rgb(var(--tf-ink))' }}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'rounded-full',
          size === 'sm' && 'h-2 w-2',
          size === 'md' && 'h-2.5 w-2.5',
          size === 'lg' && 'h-3 w-3'
        )}
        style={{ backgroundColor: c.logo, boxShadow: `0 0 0 3px ${c.accent}22` }}
      />
      {compact ? c.short : c.label}
    </span>
  );
}
