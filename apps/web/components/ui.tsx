/**
 * The Modalis component vocabulary.
 *
 * Small on purpose. Every component here earns its place by appearing in more than one screen and
 * carrying a rule that would otherwise be re-decided each time — how a state is announced, how a
 * number is set, how big a tap target is. A component that exists to hold a gradient is not here.
 *
 * Two rules run through all of it:
 *
 *   1. **A state is never colour alone.** Every tone also carries a word, so plan health survives
 *      a colour-blind reader, a greyscale print and a screenshot.
 *   2. **Touch before mouse.** Interactive elements are at least 44px tall, which is the smallest
 *      thing a thumb hits reliably, and the reason none of these are "compact" variants.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

export type Tone = "default" | "ok" | "warn" | "breach" | "accent";

const TONE_TEXT: Record<Tone, string> = {
  default: "text-ink",
  ok: "text-ok",
  warn: "text-warn",
  breach: "text-breach",
  accent: "text-accent",
};

// --------------------------------------------------------------------- surfaces

export function Card({
  children,
  className = "",
  as: Tag = "section",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
  padded?: boolean;
}) {
  return (
    <Tag
      className={`rounded-2xl border border-line bg-surface-raised ${padded ? "p-5 sm:p-6" : ""} ${className}`}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({
  children,
  hint,
  action,
}: {
  children: ReactNode;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
          {children}
        </h2>
        {hint ? <p className="mt-1.5 max-w-prose text-sm text-ink-muted">{hint}</p> : null}
      </div>
      {action ? <div className="flex-none">{action}</div> : null}
    </div>
  );
}

/** A headline figure. Tabular, so a live number never makes its row twitch. */
export function Stat({
  label,
  value,
  sub,
  tone = "default",
  size = "md",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = {
    sm: "text-xl",
    md: "text-2xl sm:text-3xl",
    lg: "text-4xl sm:text-5xl",
    xl: "text-5xl sm:text-6xl",
  } as const;
  return (
    <div>
      <div className="text-[13px] font-medium text-ink-muted">{label}</div>
      <div className={`numeric mt-1.5 font-semibold ${sizes[size]} ${TONE_TEXT[tone]}`}>{value}</div>
      {sub ? <div className="mt-1.5 text-sm text-ink-soft">{sub}</div> : null}
    </div>
  );
}

// ----------------------------------------------------------------------- status

export function Badge({
  tone = "default",
  children,
  dot = false,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  const styles: Record<Tone, string> = {
    default: "bg-surface-sunken text-ink-soft border-line",
    accent: "bg-accent-soft text-accent border-accent-line",
    ok: "bg-ok-soft text-ok border-transparent",
    warn: "bg-warn-soft text-warn border-transparent",
    breach: "bg-breach-soft text-breach border-transparent",
  };
  const dots: Record<Tone, string> = {
    default: "bg-ink-muted",
    accent: "bg-accent",
    ok: "bg-ok",
    warn: "bg-warn",
    breach: "bg-breach",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}
    >
      {dot ? <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} /> : null}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------- actions

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "md" | "lg";
  href?: string;
  /** Replaces the label while something is in flight, and announces it. */
  busy?: boolean;
  busyLabel?: string;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  busy = false,
  busyLabel,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  const sizes = {
    md: "min-h-[44px] px-5 text-sm",
    lg: "min-h-[52px] px-7 text-[15px]",
  } as const;
  const variants = {
    primary: "bg-accent text-accent-ink hover:brightness-110 active:brightness-95",
    secondary: "border border-line bg-surface-raised text-ink hover:bg-surface-sunken",
    quiet: "text-ink-soft hover:bg-surface-sunken hover:text-ink",
    danger: "border border-breach/40 text-breach hover:bg-breach-soft",
  } as const;

  const cls = [
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold",
    "transition-[filter,background-color,color,border-color] duration-150",
    "disabled:cursor-not-allowed disabled:opacity-50",
    sizes[size],
    variants[variant],
    className,
  ].join(" ");

  if (href) {
    const external = href.startsWith("http") || href.startsWith("mailto:");
    if (external) {
      return (
        <a className={cls} href={href} rel="noreferrer noopener" target="_blank">
          {children}
        </a>
      );
    }
    return (
      <Link className={cls} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? (
        <>
          <Spinner />
          {busyLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent opacity-70"
    />
  );
}

// ------------------------------------------------------------------- messaging

export function Notice({
  tone = "default",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const styles: Record<Tone, string> = {
    default: "border-line bg-surface-sunken",
    accent: "border-accent-line bg-accent-soft",
    ok: "border-transparent bg-ok-soft",
    warn: "border-transparent bg-warn-soft",
    breach: "border-transparent bg-breach-soft",
  };
  // A failure has to reach a screen reader the moment it appears, not when focus happens past it.
  const urgent = tone === "breach" || tone === "warn";
  return (
    <div
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      className={`rounded-xl border p-4 text-sm ${styles[tone]}`}
    >
      {title ? <div className={`mb-1 font-semibold ${TONE_TEXT[tone]}`}>{title}</div> : null}
      <div className="text-ink-soft [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
      {action ? <div className="mt-3.5">{action}</div> : null}
    </div>
  );
}

/**
 * A failure a person can act on.
 *
 * Financial software has to fail in three parts — what happened, what it means for their money,
 * and what to do next — because "Transaction reverted" leaves someone not knowing whether they
 * still have their money. The technical detail is available but folded away.
 */
export function Failure({
  title,
  meaning,
  next,
  detail,
  action,
}: {
  title: string;
  meaning: string;
  next?: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="rounded-xl border border-breach/30 bg-breach-soft p-4">
      <div className="font-semibold text-breach">{title}</div>
      <p className="mt-1 text-sm text-ink-soft">{meaning}</p>
      {next ? <p className="mt-2 text-sm font-medium text-ink">{next}</p> : null}
      {action ? <div className="mt-3.5">{action}</div> : null}
      {detail ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-ink-muted">
            Technical detail
          </summary>
          <p className="mt-2 break-words font-mono text-xs text-ink-muted">{detail}</p>
        </details>
      ) : null}
    </div>
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{children}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/** A placeholder with the shape of what is coming, so the page does not jump when it arrives. */
export function Skeleton({ className = "h-24" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`relative overflow-hidden rounded-xl bg-surface-sunken ${className}`}
    >
      <span className="sweeping absolute inset-0" />
    </div>
  );
}

/** Announces a wait to a screen reader, which a spinning div does not. */
export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-20" />
      <Skeleton className="h-48" />
    </div>
  );
}

// ------------------------------------------------------------------------ data

export function KeyValue({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0">
      <dt className="text-sm text-ink-muted">
        {label}
        {hint ? <span className="mt-0.5 block text-xs text-ink-muted/80">{hint}</span> : null}
      </dt>
      <dd className="numeric text-right text-sm font-semibold text-ink">{children}</dd>
    </div>
  );
}

/**
 * Where a holding sits against the range the person approved for it.
 *
 * The bar is scaled past the top of the range on purpose: a holding that has broken its limit has
 * to be visibly outside the band, not pinned to the end of the track looking merely full.
 */
export function RangeBar({
  currentPercent,
  targetPercent,
  minPercent,
  maxPercent,
  tone = "default",
  label,
}: {
  currentPercent: number;
  targetPercent: number;
  minPercent: number;
  maxPercent: number;
  tone?: Tone;
  label?: string;
}) {
  const scale = Math.max(maxPercent * 1.25, currentPercent * 1.1, 1);
  const at = (p: number) => `${Math.min(100, Math.max(0, (p / scale) * 100))}%`;
  const fill: Record<Tone, string> = {
    default: "bg-accent",
    accent: "bg-accent",
    ok: "bg-ok",
    warn: "bg-warn",
    breach: "bg-breach",
  };

  return (
    <div
      className="relative h-2.5 w-full rounded-full bg-surface-sunken"
      role="img"
      aria-label={
        label ??
        `${currentPercent}% now, ${targetPercent}% planned, allowed between ${minPercent}% and ${maxPercent}%`
      }
    >
      <div
        aria-hidden
        className="absolute inset-y-0 rounded-full bg-line-strong"
        style={{ left: at(minPercent), width: `calc(${at(maxPercent)} - ${at(minPercent)})` }}
      />
      <div
        aria-hidden
        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${fill[tone]}`}
        style={{ width: at(currentPercent) }}
      />
      <div
        aria-hidden
        className="absolute -top-1 h-[18px] w-0.5 rounded bg-ink"
        style={{ left: at(targetPercent) }}
      />
    </div>
  );
}

/** Progress toward a goal. One bar, one number, no chart. */
export function ProgressBar({
  percent,
  tone = "accent",
  label,
}: {
  percent: number;
  tone?: Tone;
  label: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const fill: Record<Tone, string> = {
    default: "bg-ink",
    accent: "bg-accent",
    ok: "bg-ok",
    warn: "bg-warn",
    breach: "bg-breach",
  };
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ${fill[tone]}`}
        style={{ width: `${clamped}%`, transitionTimingFunction: "var(--ease-out-soft)" }}
      />
    </div>
  );
}
