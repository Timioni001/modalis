import { getAddress, isAddress, zeroAddress } from "viem";

export const PAYMENT_CHAIN = 10143;
export function paymentAmount(value: string): string | null {
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,6})?$/.test(value)) return null;
  const amount = Number(value);
  return amount > 0 && amount <= 1_000_000 ? value : null;
}
export function paymentRequestPath(
  recipient: string,
  amount: string,
  purpose: string,
): string {
  if (!isAddress(recipient) || recipient.toLowerCase() === zeroAddress)
    throw new Error("Enter a valid recipient wallet address.");
  if (!paymentAmount(amount))
    throw new Error(
      "Use 0.000001 to 1,000,000 demo dollars, with at most six decimal places.",
    );
  const query = new URLSearchParams({
    amount,
    for: purpose.trim().slice(0, 80),
    chain: String(PAYMENT_CHAIN),
    asset: "mUSD",
  });
  return `/app/gift/${getAddress(recipient)}?${query}`;
}
/** Requests are suggestions, never signatures or authorizations. Revalidate before payment. */
export function readPaymentRequest(query: Pick<URLSearchParams, "get">): {
  amount: number;
  error: string | null;
} {
  const chain = query.get("chain"),
    asset = query.get("asset"),
    raw = query.get("amount");
  if (
    (chain !== null && chain !== String(PAYMENT_CHAIN)) ||
    (asset !== null && asset !== "mUSD")
  ) {
    return {
      amount: 25,
      error:
        "This request uses an unsupported network or asset. Only mUSD on Monad Testnet is supported.",
    };
  }
  if (raw !== null && !paymentAmount(raw))
    return {
      amount: 25,
      error:
        "This payment request contains an invalid amount. Ask for a new link.",
    };
  return { amount: raw === null ? 25 : Number(raw), error: null };
}
