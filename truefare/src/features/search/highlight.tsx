import type { ReactNode } from 'react';

/** Wrap matched terms in <mark> — warm saffron, never harsh yellow. */
export function highlight(text: string, terms: string[]): ReactNode {
  if (!terms.length) return text;
  const escaped = terms
    .filter((t) => t.length > 1)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return text;
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part) ? (
      <mark key={i} className="rounded-sm bg-saffron/30 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      part
    )
  );
}
