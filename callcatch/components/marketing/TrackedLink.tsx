"use client";

import Link from "next/link";
import { useCallback, type ReactNode, type MouseEvent } from "react";
import { newEventId, trackPixel, type PixelParams, type PixelStandardEvent } from "@/lib/meta/pixel";

type Props = {
  href: string;
  /** Pixel standard event to fire on click. */
  event: PixelStandardEvent;
  /** Stable analytics id, rendered as `data-event` for QA and Meta's event setup tool. */
  dataEvent: string;
  params?: PixelParams;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
  /** When true, the generated eventId is appended as `?eid=` so downstream server events can dedupe. */
  forwardEventId?: boolean;
};

function isExternalScheme(href: string) {
  return /^(tel:|mailto:|sms:|https?:\/\/)/i.test(href);
}

function withEventId(href: string, eventId: string): string {
  if (isExternalScheme(href)) return href;
  const [pathAndQuery, hash] = href.split("#");
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  return `${pathAndQuery}${sep}eid=${encodeURIComponent(eventId)}${hash ? `#${hash}` : ""}`;
}

/**
 * CTA link that fires a Meta Pixel event (with a fresh eventId) on click.
 * Renders <Link> for internal routes and <a> for tel:/mailto:/external.
 */
export function TrackedLink({ href, event, dataEvent, params, className, children, ariaLabel, forwardEventId = false }: Props) {
  const onClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      const eventId = newEventId();
      trackPixel(event, { content_name: dataEvent, ...params }, eventId);
      if (forwardEventId && !isExternalScheme(href)) {
        e.preventDefault();
        window.location.assign(withEventId(href, eventId));
      }
    },
    [event, dataEvent, params, forwardEventId, href]
  );

  if (isExternalScheme(href)) {
    return (
      <a href={href} className={className} data-event={dataEvent} onClick={onClick} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} data-event={dataEvent} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
