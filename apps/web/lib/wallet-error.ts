import { isOutOfGasFundsError } from "@modalis/chain";

/**
 * Wallet providers return long, provider-specific error objects. Never put that raw string in the
 * page: it can contain an unbroken RPC payload that makes a mobile layout wider than the viewport.
 * Keep the user-facing message short and actionable while the provider keeps its own diagnostics.
 */
export function walletActionMessage(
  error: unknown,
  fallback = "That action did not finish. Nothing was changed.",
): string {
  const text = errorText(error);
  if (isOutOfGasFundsError(error) || /insufficient\s+(?:funds|balance).*gas/i.test(text)) {
    return "Your wallet does not have enough MON to pay the network fee. Add test MON, then try again.";
  }
  if (
    /user\s+(?:rejected|denied)|request\s+(?:rejected|denied)|action\s+rejected|code\s*[:=]\s*4001/i.test(
      text,
    )
  ) {
    return "You cancelled the wallet request. Nothing was changed.";
  }
  if (/wrong network|chain mismatch|switch .*network|unsupported chain/i.test(text)) {
    return "Switch your wallet to Monad Testnet, then try again.";
  }
  if (/execution reverted|transaction reverted|transaction failed|reverted/i.test(text)) {
    return "The network rejected that transaction. Nothing was changed.";
  }
  return fallback;
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  for (let i = 0; current && i < 6 && !seen.has(current); i++) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.name, current.message);
      const shaped = current as Error & { shortMessage?: string; code?: unknown; cause?: unknown };
      if (shaped.shortMessage) parts.push(shaped.shortMessage);
      if (shaped.code !== undefined) parts.push(String(shaped.code));
      current = shaped.cause;
    } else if (typeof current === "object") {
      const shaped = current as { message?: unknown; shortMessage?: unknown; code?: unknown; cause?: unknown };
      if (shaped.message) parts.push(String(shaped.message));
      if (shaped.shortMessage) parts.push(String(shaped.shortMessage));
      if (shaped.code !== undefined) parts.push(String(shaped.code));
      current = shaped.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" ");
}
