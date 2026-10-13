"use client";

/**
 * The Modalis component vocabulary.
 *
 * Small on purpose. Each one carries a rule that would otherwise be re-decided on every screen:
 * how a state is announced, how a number is set, how big a tap target is, how a card lifts off
 * the canvas.
 *
 * Two rules run through all of it. A state is never colour alone — every tone also carries a
 * word. And touch comes before mouse: interactive things are at least 44px tall, which is the
 * smallest a thumb hits reliably.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import Link from "next/link";

export type Tone = "default" | "ok" | "warn" | "breach" | "accent";

const TONE_TEXT: Record<Tone, string> = {
  default: "text-ink",
  ok: "text-ok",
  warn: "text-warn",
  breach: "text-breach",
  accent: "text-ink",
};

// --------------------------------------------------------------------- surfaces

/** A white card floating on the grey canvas. The default container for everything. */
export function Card({
  children,
  className = "",
  as: Tag = "section",
  padded = true,
  lift = false,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
  padded?: boolean;
  lift?: boolean;
}) {
  return (
    <Tag
      className={`rounded-3xl bg-surface ${padded ? "p-5 sm:p-6" : ""} ${
        lift ? "shadow-[var(--shadow-lift)]" : "shadow-[var(--shadow-card)]"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * The black panel. One per screen, for the figure that matters most.
 *
 * Its job is hierarchy: against white cards on a grey canvas, this is where the eye lands first.
 * Using two on a screen would mean neither is the answer.
 */
export function Panel({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={`rounded-3xl bg-panel p-6 text-panel-ink shadow-[var(--shadow-lift)] sm:p-7 ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * The top of an app screen: what this screen is, and the one action it offers.
 *
 * Every app screen uses it, so the title always lands in the same place and someone moving
 * between tabs never has to re-find their bearings.
 */
export function PageHeader({
  title,
  lede,
  action,
}: {
  title: string;
  lede?: string;
  action?: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-[28px] font-semibold text-ink sm:text-[34px]">{title}</h1>
        {action ? <div className="flex-none">{action}</div> : null}
      </div>
      {lede ? <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-ink-soft">{lede}</p> : null}
    </div>
  );
}

/**
 * A hairline-separated list.
 *
 * Drawn as a gap in a coloured background rather than with borders, so the first and last rows
 * never need an exception and the whole block clips to one radius.
 */
export function Rows({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-px overflow-hidden rounded-2xl bg-line ${className}`}>{children}</div>
  );
}

export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface px-4 py-3.5 sm:px-5 ${className}`}>{children}</div>;
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
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{children}</h2>
        {hint ? <p className="mt-1 max-w-prose text-sm text-ink-muted">{hint}</p> : null}
      </div>
      {action ? <div className="flex-none">{action}</div> : null}
    </div>
  );
}

/** A label above a figure. Small, muted, never competing with the number. */
export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[13px] font-medium text-ink-muted">{children}</div>;
}

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
    md: "text-[28px] sm:text-3xl",
    lg: "text-4xl sm:text-5xl",
    xl: "text-5xl sm:text-[64px]",
  } as const;
  return (
    <div>
      <Label>{label}</Label>
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
    default: "bg-sunken text-ink-soft",
    accent: "bg-accent text-accent-ink",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    breach: "bg-breach-soft text-breach",
  };
  const dots: Record<Tone, string> = {
    default: "bg-ink-muted",
    accent: "bg-accent-ink",
    ok: "bg-ok",
    warn: "bg-warn",
    breach: "bg-breach",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${styles[tone]}`}
    >
      {dot ? <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} /> : null}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------- actions

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "dark" | "secondary" | "quiet" | "danger";
  size?: "md" | "lg";
  href?: string;
  busy?: boolean;
  busyLabel?: string;
  full?: boolean;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  busy = false,
  busyLabel,
  full = false,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  const sizes = {
    md: "min-h-[46px] px-5 text-[14.5px]",
    lg: "min-h-[54px] px-7 text-[15.5px]",
  } as const;
  const variants = {
    primary: "bg-accent text-accent-ink hover:brightness-[1.04] active:brightness-95",
    dark: "bg-panel text-panel-ink hover:opacity-90",
    secondary: "bg-surface text-ink shadow-[var(--shadow-card)] hover:bg-sunken",
    quiet: "text-ink-soft hover:bg-sunken hover:text-ink",
    danger: "bg-breach-soft text-breach hover:brightness-95",
  } as const;

  const cls = [
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold",
    "transition-[filter,background-color,color,opacity,transform] duration-150",
    "active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
    full ? "w-full" : "",
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

// ----------------------------------------------------------------------- fields

/**
 * A labelled field.
 *
 * The label is a real `<label>` tied to the control, which is what makes the whole thing
 * announce properly and makes tapping the label focus the input.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  error,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[14.5px] font-medium text-ink">
        {label}
      </label>
      {hint ? <p className="mt-1 text-sm text-ink-muted">{hint}</p> : null}
      <div className="mt-2.5">{children}</div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-breach">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const FIELD_BASE =
  "min-w-0 w-full rounded-2xl bg-surface px-4 text-[16px] text-ink shadow-[var(--shadow-card)] " +
  "outline-none transition-shadow placeholder:text-ink-muted " +
  "focus:shadow-[0_0_0_2px_var(--color-ink)]";

export function TextField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD_BASE} min-h-[52px] ${props.className ?? ""}`} />;
}

/**
 * A money field.
 *
 * Text rather than number, so the value can carry thousands separators — "$40000" reads like a
 * database row, "$40,000" reads like money — and so the spinner arrows never appear. The numeric
 * keypad still comes up on a phone.
 */
export function MoneyField({
  id,
  value,
  onChange,
  min = 0,
  max = 100_000_000,
  ...rest
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "id" | "min" | "max">) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-ink-muted"
      >
        $
      </span>
      <input
        {...rest}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value.toLocaleString("en-US")}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          onChange(digits === "" ? 0 : Math.min(max, Number(digits.slice(0, 12))));
        }}
        onBlur={() => onChange(Math.min(max, Math.max(min, value)))}
        className={`numeric ${FIELD_BASE} min-h-[52px] pl-9 text-[17px] font-semibold`}
      />
    </div>
  );
}

export function SelectField(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`field ${FIELD_BASE} min-h-[52px] cursor-pointer ${props.className ?? ""}`}
    />
  );
}

/**
 * A choice between a few options.
 *
 * Real radio inputs underneath, so arrow keys move between them and a screen reader announces
 * the group — which a row of buttons does not do.
 */
export function Choices<T extends string>({
  name,
  value,
  onChange,
  options,
  columns = 3,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
  columns?: 1 | 2 | 3;
}) {
  const cols = { 1: "grid-cols-1", 2: "grid-cols-1 sm:grid-cols-2", 3: "grid-cols-1 sm:grid-cols-3" };
  return (
    <div role="radiogroup" className={`grid gap-2.5 ${cols[columns]}`}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <label
            key={option.value}
            className={`flex min-h-[52px] cursor-pointer items-center rounded-2xl px-4 py-3 text-[14.5px] font-medium transition-all duration-150 ${
              selected
                ? "bg-panel text-panel-ink shadow-[var(--shadow-card)]"
                : "bg-surface text-ink shadow-[var(--shadow-card)] hover:bg-sunken"
            }`}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={selected}
              onChange={() => onChange(option.value)}
            />
            <span>
              {option.label}
              {option.hint ? (
                <span
                  className={`mt-0.5 block text-xs font-normal ${
                    selected ? "text-panel-soft" : "text-ink-muted"
                  }`}
                >
                  {option.hint}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** A slider with its value shown above it, because a slider alone never says where it is. */
export function Slider({
  id,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  minLabel,
  maxLabel,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  minLabel?: string;
  maxLabel?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="numeric text-[26px] font-semibold text-ink">{format(value)}</div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range mt-3"
        style={{
          ["--track" as string]: `linear-gradient(to right, var(--color-ink) ${pct}%, var(--color-line) ${pct}%)`,
        }}
      />
      {minLabel || maxLabel ? (
        <div className="mt-1 flex justify-between text-xs text-ink-muted">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      ) : null}
    </div>
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
    default: "bg-sunken",
    accent: "bg-accent-soft",
    ok: "bg-ok-soft",
    warn: "bg-warn-soft",
    breach: "bg-breach-soft",
  };
  const urgent = tone === "breach" || tone === "warn";
  return (
    <div
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      className={`min-w-0 max-w-full rounded-2xl p-4 text-sm ${styles[tone]}`}
    >
      {title ? <div className={`mb-1 font-semibold ${TONE_TEXT[tone]}`}>{title}</div> : null}
      <div className="min-w-0 break-words text-ink-soft [overflow-wrap:anywhere] [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
      {action ? <div className="mt-3.5">{action}</div> : null}
    </div>
  );
}

/**
 * A failure in three parts: what happened, what it means for the money, what to do next.
 *
 * "Transaction reverted" leaves someone not knowing whether they still have their money. The
 * technical detail is kept but folded away.
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
    <div role="alert" className="rounded-2xl bg-breach-soft p-4">
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
    <Card className="px-6 py-14 text-center">
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      {children ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{children}</p>
      ) : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </Card>
  );
}

export function Skeleton({ className = "h-24" }: { className?: string }) {
  return (
    <div aria-hidden className={`relative overflow-hidden rounded-2xl bg-sunken ${className}`}>
      <span className="shimmer absolute inset-0" />
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-32" />
      <Skeleton className="h-52" />
    </div>
  );
}

// ------------------------------------------------------------------------ data

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="numeric text-right text-[15px] font-semibold text-ink">{children}</dd>
    </div>
  );
}

/**
 * Progress toward the goal, drawn as a corridor.
 *
 * The band is the room the plan is allowed to move in and the marker is where it actually sits.
 * It is the product's central idea — limits you set, something moving inside them — so it is
 * drawn rather than described.
 */
export function Corridor({
  percent,
  bandFrom = 0,
  bandTo = 100,
  target,
  tone = "accent",
  label,
}: {
  percent: number;
  bandFrom?: number;
  bandTo?: number;
  /** Where the plan says this should sit. Drawn as a tick, not a fill. */
  target?: number;
  tone?: Tone;
  label: string;
}) {
  const at = (p: number) => `${Math.min(100, Math.max(0, p))}%`;
  const fills: Record<Tone, string> = {
    default: "bg-ink",
    accent: "bg-accent",
    ok: "bg-ok",
    warn: "bg-warn",
    breach: "bg-breach",
  };
  return (
    <div
      role="img"
      aria-label={label}
      className="relative h-3 w-full overflow-hidden rounded-full bg-line"
    >
      <div
        aria-hidden
        className="absolute inset-y-0 bg-line-strong/60"
        style={{ left: at(bandFrom), width: `calc(${at(bandTo)} - ${at(bandFrom)})` }}
      />
      <div
        aria-hidden
        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ${fills[tone]}`}
        style={{ width: at(percent), transitionTimingFunction: "var(--ease-out-soft)" }}
      />
      {target === undefined ? null : (
        <span
          aria-hidden
          // A white halo on both sides, so the tick is visible whether it lands on the filled
          // part of the bar or on the empty band behind it.
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink shadow-[0_0_0_1px_var(--color-surface)]"
          style={{ left: at(target) }}
        />
      )}
    </div>
  );
}

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
  const fills: Record<Tone, string> = {
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
      className="h-3 w-full overflow-hidden rounded-full bg-line"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ${fills[tone]}`}
        style={{ width: `${clamped}%`, transitionTimingFunction: "var(--ease-out-soft)" }}
      />
    </div>
  );
}
