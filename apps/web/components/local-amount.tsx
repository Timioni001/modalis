"use client";

/**
 * "≈ ₦18,400,000" under a dollar figure, in the currency the person chose in Settings.
 * Display only, from today's rate; plans are always held in dollars.
 */
import { useEffect, useState } from "react";

const KEY = "modalis.currency";
let ratesPromise: Promise<Record<string, number> | null> | null = null;

function rates(): Promise<Record<string, number> | null> {
  ratesPromise ??= fetch("/api/fx")
    .then((r) => (r.ok ? r.json() : null))
    .then((b: { rates?: Record<string, number> } | null) => b?.rates ?? null)
    .catch(() => null);
  return ratesPromise;
}

export function chosenCurrency(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function chooseCurrency(code: string | null): void {
  try {
    if (code) localStorage.setItem(KEY, code);
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("modalis-currency"));
  } catch {
    /* storage blocked: the choice just won't stick */
  }
}

export function useLocalCurrency(): string | null {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setCode(chosenCurrency());
    read();
    window.addEventListener("modalis-currency", read);
    return () => window.removeEventListener("modalis-currency", read);
  }, []);
  return code;
}

export function LocalAmount({ usd, className = "text-ink-muted" }: { usd: number | string | undefined; className?: string }) {
  const code = useLocalCurrency();
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    if (!code) return;
    void rates().then((r) => setRate(r?.[code] ?? null));
  }, [code]);

  const n = Number(usd);
  if (!code || !rate || !Number.isFinite(n)) return null;
  const value = new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: 0 }).format(n * rate);
  return (
    <span className={`numeric text-sm ${className}`} title="At today's rate. Your plan is held in US dollars.">
      ≈ {value}
    </span>
  );
}
