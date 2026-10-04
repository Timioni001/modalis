/**
 * The Modalis component vocabulary.
 *
 * Design intent, from the brief: premium consumer fintech, not a trading terminal. White
 * dominant, one restrained blue accent, large legible numbers, strong spacing, minimal jargon.
 *
 * Risk states always pair colour with a word, so the state survives a colour-blind reader, a
 * greyscale print and a screenshot.
 */
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
}) {
  return (
    <Tag className={`rounded-2xl border border-line bg-white p-6 ${className}`}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {children}
      </h2>
      {hint ? <p className="mt-1 text-sm text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** A headline figure. Numbers are tabular so columns do not jitter as values change. */
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
  size?: "md" | "lg" | "xl";
}) {
  const sizes = {
    md: "text-2xl",
    lg: "text-4xl",
    xl: "text-5xl sm:text-6xl",
  } as const;
  return (
    <div>
      <div className="text-[13px] font-medium text-ink-muted">{label}</div>
      <div className={`numeric mt-1 font-semibold ${sizes[size]} ${toneText(tone)}`}>{value}</div>
      {sub ? <div className="mt-1 text-sm text-ink-soft">{sub}</div> : null}
    </div>
  );
}

export type Tone = "default" | "ok" | "warn" | "breach" | "accent";

function toneText(tone: Tone): string {
  switch (tone) {
    case "ok":
      return "text-ok";
    case "warn":
      return "text-warn";
    case "breach":
      return "text-breach";
    case "accent":
      return "text-accent";
    default:
      return "text-ink";
  }
}

export function Badge({ tone = "default", children }: { tone?: Tone; children: ReactNode }) {
  const styles: Record<Tone, string> = {
    default: "bg-surface-sunken text-ink-soft border-line",
    accent: "bg-accent-soft text-accent border-transparent",
    ok: "bg-ok-soft text-ok border-transparent",
    warn: "bg-warn-soft text-warn border-transparent",
    breach: "bg-breach-soft text-breach border-transparent",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  type = "button",
  disabled,
  onClick,
  href,
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45";
  const variants = {
    primary: "bg-accent text-white hover:bg-[#1a44ba]",
    secondary: "border border-line bg-white text-ink hover:bg-surface-sunken",
    quiet: "text-ink-soft hover:bg-surface-sunken",
    danger: "border border-breach text-breach hover:bg-breach-soft",
  } as const;
  const cls = `${base} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} className={cls} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** A horizontal allocation bar: current position against its permitted range. */
export function RangeBar({
  currentBps,
  targetBps,
  minBps,
  maxBps,
  tone = "default",
}: {
  currentBps: number;
  targetBps: number;
  minBps: number;
  maxBps: number;
  tone?: Tone;
}) {
  // Scaled against the top of the permitted range plus headroom, so a breach is visibly outside.
  const scale = Math.max(maxBps * 1.25, currentBps * 1.1, 1);
  const pos = (bps: number) => `${Math.min(100, (bps / scale) * 100)}%`;
  const fill: Record<Tone, string> = {
    default: "bg-accent",
    accent: "bg-accent",
    ok: "bg-ok",
    warn: "bg-warn",
    breach: "bg-breach",
  };

  return (
    <div className="relative h-2.5 w-full rounded-full bg-surface-sunken">
      {/* permitted range */}
      <div
        className="absolute inset-y-0 rounded-full bg-line"
        style={{ left: pos(minBps), width: `calc(${pos(maxBps)} - ${pos(minBps)})` }}
        aria-hidden
      />
      {/* current */}
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${fill[tone]}`}
        style={{ width: pos(currentBps) }}
        aria-hidden
      />
      {/* target marker */}
      <div
        className="absolute -top-1 h-[18px] w-0.5 bg-ink"
        style={{ left: pos(targetBps) }}
        aria-hidden
      />
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="numeric text-sm font-semibold text-ink">{children}</dd>
    </div>
  );
}

export function Notice({
  tone = "default",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  const styles: Record<Tone, string> = {
    default: "border-line bg-surface-sunken",
    accent: "border-transparent bg-accent-soft",
    ok: "border-transparent bg-ok-soft",
    warn: "border-transparent bg-warn-soft",
    breach: "border-transparent bg-breach-soft",
  };
  return (
    <div className={`rounded-xl border p-4 text-sm ${styles[tone]}`}>
      {title ? <div className={`mb-1 font-semibold ${toneText(tone)}`}>{title}</div> : null}
      <div className="text-ink-soft [&_a]:underline">{children}</div>
    </div>
  );
}

/** Explicit empty state. Better than an empty panel that looks broken. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children ? <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{children}</p> : null}
    </div>
  );
}
