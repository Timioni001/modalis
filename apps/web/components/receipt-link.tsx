"use client";

/**
 * A receipt: proof that something actually happened, that the person can check themselves.
 *
 * Shown as a link to the public record when this deployment knows where that is, and as plain
 * text otherwise rather than a dead link. Every reference here comes from a real transaction —
 * nothing in this app ever constructs one.
 */
import { useWalletConfig } from "./wallet-context";
import { shortAddress, shortReference } from "@/lib/format";

export function ReceiptLink({ reference, address }: { reference?: string; address?: string }) {
  const { explorerUrl } = useWalletConfig();
  const value = reference ?? address;
  if (!value) return null;
  const label = reference ? shortReference(reference) : shortAddress(address!);

  if (!explorerUrl) {
    return (
      <code className="numeric text-xs text-ink-soft" title={value}>
        {label}
      </code>
    );
  }

  const base = explorerUrl.replace(/\/$/, "");
  const href = reference ? `${base}/tx/${reference}` : `${base}/address/${address}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="numeric text-xs font-medium text-accent underline"
      title={value}
    >
      {label}
    </a>
  );
}
