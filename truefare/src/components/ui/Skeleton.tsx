import clsx from 'clsx';

/** Warm shimmer block. Size it exactly like the content it replaces. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div aria-hidden="true" className={clsx('skeleton rounded-control', className)} style={style} />;
}
