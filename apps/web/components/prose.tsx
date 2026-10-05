/**
 * The long-form page frame.
 *
 * Legal and explanatory pages share one shape so they read as one document set rather than four
 * pages written on four different days. Measure is capped near 70 characters, which is where
 * reading speed stops improving and starts getting worse.
 */
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  lede,
  updated,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  updated?: string;
}) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        {eyebrow ? (
          <p className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="display mt-4 text-4xl font-semibold text-ink sm:text-5xl">{title}</h1>
        {lede ? (
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">{lede}</p>
        ) : null}
        {updated ? <p className="mt-6 text-sm text-ink-muted">Last updated {updated}</p> : null}
      </div>
    </header>
  );
}

/**
 * Typographic defaults for written content.
 *
 * Set here rather than with a plugin: the rules are a dozen lines, and a dependency that styles
 * text is a dependency that also decides things we would then have to override.
 */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div
      className="
        mx-auto max-w-3xl px-5 py-14
        [&>h2]:display [&>h2]:mt-14 [&>h2]:scroll-mt-24 [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:text-ink
        [&>h2:first-child]:mt-0
        [&>h3]:mt-9 [&>h3]:text-lg [&>h3]:font-semibold [&>h3]:text-ink
        [&>p]:mt-4 [&>p]:leading-[1.75] [&>p]:text-ink-soft
        [&>ul]:mt-4 [&>ul]:space-y-2.5 [&>ul]:pl-5 [&>ul>li]:list-disc [&>ul>li]:leading-[1.7] [&>ul>li]:text-ink-soft
        [&>ol]:mt-4 [&>ol]:space-y-2.5 [&>ol]:pl-5 [&>ol>li]:list-decimal [&>ol>li]:leading-[1.7] [&>ol>li]:text-ink-soft
        [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2
        [&_strong]:font-semibold [&_strong]:text-ink
      "
    >
      {children}
    </div>
  );
}

/** A statement that should stop the eye, used where a page has one thing that really matters. */
export function Pull({ children }: { children: ReactNode }) {
  return (
    <p className="my-10 border-l-2 border-accent pl-5 text-lg font-medium leading-relaxed text-ink">
      {children}
    </p>
  );
}
