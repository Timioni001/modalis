export function chainFailure(error: unknown): { code: string; message: string; status: number } | null {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const item = current as { data?: { errorName?: string }; message?: string; cause?: unknown };
    const name = item.data?.errorName;
    if (name === "PRICE_STALE" || name === "PRICE_UNAVAILABLE" ||
        /PRICE_STALE|PRICE_UNAVAILABLE|0x34985544/.test(item.message ?? "")) {
      return { code: "prices_unavailable", status: 503,
        message: "Current prices are unavailable. Your plan rules are still saved; balances and price-dependent actions are temporarily unavailable. Try again after prices are refreshed." };
    }
    current = item.cause;
  }
  return null;
}
