import { Star } from 'lucide-react';

export function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ink">
      <Star size={13} className="fill-saffron text-saffron" aria-hidden="true" />
      <span className="tabular">{rating.toFixed(1)}</span>
    </span>
  );
}
