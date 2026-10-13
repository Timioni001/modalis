/** Pure policy. A testnet demo may be inferred only when its mock oracle is configured. */
export function demoEnabled(input: {
  flag?: string;
  chainId: number;
  oracle?: string;
}): boolean {
  if (input.chainId !== 10143) return false;
  if (input.flag !== undefined && input.flag.trim() !== "")
    return input.flag.trim().toLowerCase() === "true";
  return Boolean(input.oracle && /^0x[0-9a-fA-F]{40}$/.test(input.oracle));
}

/** A fallback signer is usable only if it is the existing oracle owner. */
export function ownerSigner<T extends { address: string }>(
  owner: string,
  candidates: T[],
): T | null {
  return (
    candidates.find(
      (candidate) => candidate.address.toLowerCase() === owner.toLowerCase(),
    ) ?? null
  );
}
