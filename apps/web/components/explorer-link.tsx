"use client";

/**
 * A link to a transaction or address on the block explorer.
 *
 * Renders the hash as plain text when no explorer is configured, rather than producing a dead
 * link. Hashes shown here always come from a node — nothing in this app constructs one.
 */
import { useWalletConfig } from "./wallet-context";
import { shortHash, shortAddress } from "@/lib/format";

export function ExplorerLink({ hash, address }: { hash?: string; address?: string }) {
  const { explorerUrl } = useWalletConfig();
  const value = hash ?? address;
  if (!value) return null;
  const label = hash ? shortHash(hash) : shortAddress(address!);

  if (!explorerUrl) {
    return (
      <code className="numeric text-xs text-ink-soft" title={value}>
        {label}
      </code>
    );
  }

  const base = explorerUrl.replace(/\/$/, "");
  const href = hash ? `${base}/tx/${hash}` : `${base}/address/${address}`;
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
