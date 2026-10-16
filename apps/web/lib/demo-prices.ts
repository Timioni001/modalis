import "server-only";
import { MockPriceOracleAbi, createManagerWalletClient } from "@modalis/chain";
import { refreshPrices } from "@modalis/risk-monitor";
import { DomainError } from "@modalis/domain";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex, WalletClient } from "viem";
import { demoEnabled, ownerSigner } from "./demo-price-policy";
import type { ServerContext } from "./server";
import { pricesChanged } from "./health-version";

export type PriceRecovery = {
  enabled: boolean;
  canRefresh: boolean;
  owner?: Address;
  reason:
    | "ready"
    | "disabled"
    | "missing_signer"
    | "needs_gas"
    | "unsupported_oracle";
};

export async function priceRecovery(
  ctx: ServerContext,
): Promise<PriceRecovery> {
  const oracle = ctx.deployment.contracts.priceOracle;
  if (
    !demoEnabled({
      flag: process.env.DEMO_MODE,
      chainId: ctx.deployment.chainId,
      oracle,
    })
  )
    return { enabled: false, canRefresh: false, reason: "disabled" };
  try {
    const [owner, maxAge] = await Promise.all([
      ctx.client.readContract({
        address: oracle!,
        abi: MockPriceOracleAbi,
        functionName: "owner",
      }),
      ctx.client.readContract({
        address: oracle!,
        abi: MockPriceOracleAbi,
        functionName: "maxAge",
      }),
    ]);
    if (maxAge <= 0n)
      return { enabled: true, canRefresh: false, reason: "unsupported_oracle" };
    const signer = matchingSigner(owner);
    if (!signer)
      return {
        enabled: true,
        canRefresh: false,
        owner,
        reason: "missing_signer",
      };
    const gas = await ctx.client.getBalance({ address: owner });
    return {
      enabled: true,
      canRefresh: gas > 0n,
      owner,
      reason: gas > 0n ? "ready" : "needs_gas",
    };
  } catch {
    return { enabled: true, canRefresh: false, reason: "unsupported_oracle" };
  }
}

function matchingSigner(owner: Address) {
  const candidates = [
    process.env.ORACLE_UPDATER_PRIVATE_KEY,
    process.env.DEPLOYER_PRIVATE_KEY,
    process.env.FAUCET_PRIVATE_KEY,
    process.env.MANAGER_PRIVATE_KEY,
  ].flatMap((key) => {
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key.trim())) return [];
    try {
      return [
        {
          address: privateKeyToAccount(key.trim() as Hex).address,
          key: key.trim() as Hex,
        },
      ];
    } catch {
      return [];
    }
  });
  return ownerSigner(owner, candidates);
}

const pending = new Map<string, Promise<{ reference: Hex }[]>>();

/** Authenticated callers and the authenticated cron only. Public status never signs writes. */
export async function recoverPrices(
  ctx: ServerContext,
): Promise<{ reference: Hex }[]> {
  const identity = `${ctx.deployment.chainId}:${ctx.deployment.contracts.priceOracle}`;
  const existing = pending.get(identity);
  if (existing) return existing;
  const action = (async () => {
    const recovery = await priceRecovery(ctx);
    if (!recovery.canRefresh || !recovery.owner)
      throw new DomainError(
        "price_recovery_unavailable",
        recovery.reason === "needs_gas"
          ? "The demo pricing account needs testnet gas. Payments and saved plans remain available."
          : "The demo operator needs to connect the existing pricing account. Payments and saved plans remain available.",
        503,
      );
    const selected = matchingSigner(recovery.owner)!;
    const wallet: WalletClient = createManagerWalletClient(
      ctx.rpc,
      selected.key,
    );
    const tokens = Object.entries(ctx.deployment.tokens).map(
      ([symbol, token]) => ({ symbol, token }),
    );
    if (tokens.length === 0)
      throw new DomainError(
        "price_recovery_unavailable",
        "The demo assets aren't configured.",
        503,
      );
    // Recheck every quote. Never invent a price, disable expiry, or refresh a healthy oracle.
    const quotes = await Promise.all(
      tokens.map(({ token }) =>
        ctx.client.readContract({
          address: ctx.deployment.contracts.priceOracle!,
          abi: MockPriceOracleAbi,
          functionName: "quotes",
          args: [token],
        }),
      ),
    );
    if (quotes.some(([price]) => price <= 0n))
      throw new DomainError(
        "price_recovery_unavailable",
        "A demo asset has no recorded price. The operator needs to configure it.",
        503,
      );
    const [block, maxAge] = await Promise.all([
      ctx.client.getBlock(),
      ctx.client.readContract({
        address: ctx.deployment.contracts.priceOracle!,
        abi: MockPriceOracleAbi,
        functionName: "maxAge",
      }),
    ]);
    if (quotes.every(([, at]) => block.timestamp - at <= maxAge)) return [];
    const result = await refreshPrices(
      wallet,
      ctx.client,
      ctx.deployment,
      tokens,
    );
    pricesChanged();
    return result.writes.map((write) => ({ reference: write.hash }));
  })();
  pending.set(identity, action);
  try {
    return await action;
  } finally {
    pending.delete(identity);
  }
}
