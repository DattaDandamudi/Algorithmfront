import type { ReactNode } from "react";
import Link from "next/link";
import { Container } from "./ui";
import { LEGAL_LAST_UPDATED, LEGAL_LAST_UPDATED_ISO, LEGAL_LINKS } from "./site";

export function LegalPage({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <Container className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[220px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Legal</p>
        <ul className="mt-3 space-y-1.5">
          {LEGAL_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-sm text-brand-700 hover:text-brand-900 hover:underline" aria-current={l.label === title ? "page" : undefined}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <article className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-brand-600">
          Last updated: <time dateTime={LEGAL_LAST_UPDATED_ISO}>{LEGAL_LAST_UPDATED}</time>
        </p>
        <p className="mt-5 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm leading-relaxed text-brand-800">{summary}</p>
        <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-brand-800">{children}</div>
      </article>
    </Container>
  );
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 pt-6 text-xl font-bold text-brand-900">
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 text-base font-semibold text-brand-900">{children}</h3>;
}

export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-6">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export function OL({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-6">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  );
}

/** Monospace block for sample SMS messages (reviewers copy these). */
export function SampleMessage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="rounded-2xl border border-brand-100 bg-white p-4">
      <figcaption className="text-xs font-semibold uppercase tracking-wide text-brand-600">{label}</figcaption>
      <pre className="mt-2 whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-brand-900">{children}</pre>
    </figure>
  );
}
