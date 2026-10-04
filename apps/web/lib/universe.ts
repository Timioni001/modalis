/**
 * The asset universe, read from AssetRegistry rather than hard-coded.
 *
 * Asset CLASS (growth / defensive / liquid) is the one piece of metadata the registry does not
 * store, because it is an allocation-planning concept rather than a protocol rule. It is derived
 * from the registry's own `isLiquid` flag plus a small, explicit mapping, and any unknown asset
 * defaults to `defensive` — the conservative choice.
 */
import { AssetRegistryAbi, requireContract, type Deployment } from "@modalis/chain";
import type { AssetClass, UniverseAsset } from "@modalis/ai";
import type { Address, PublicClient } from "viem";

const CLASS_BY_SYMBOL: Record<string, AssetClass> = {
  mBTC: "growth",
  mETH: "growth",
  mBOND: "defensive",
  mUSD: "liquid",
};

/** Relative weight inside a class. Higher gets more of the sleeve. */
const WEIGHT_BY_SYMBOL: Record<string, number> = { mBTC: 6, mETH: 4 };

export async function readUniverse(
  client: PublicClient,
  deployment: Deployment,
): Promise<UniverseAsset[]> {
  const registry = requireContract(deployment, "assetRegistry");

  const tokens = (await client.readContract({
    address: registry,
    abi: AssetRegistryAbi,
    functionName: "listAssets",
    args: [],
  })) as readonly Address[];

  const assets = await Promise.all(
    tokens.map(
      (token) =>
        client.readContract({
          address: registry,
          abi: AssetRegistryAbi,
          functionName: "getAsset",
          args: [token],
        }) as Promise<{
          token: Address;
          maxBps: number;
          decimals: number;
          enabled: boolean;
          isLiquid: boolean;
          symbol: string;
        }>,
    ),
  );

  return assets
    .filter((a) => a.enabled)
    .map((a) => ({
      token: a.token,
      symbol: a.symbol,
      decimals: Number(a.decimals),
      assetClass: CLASS_BY_SYMBOL[a.symbol] ?? (a.isLiquid ? "liquid" : "defensive"),
      isLiquid: a.isLiquid,
      assetMaxBps: Number(a.maxBps),
      classWeight: WEIGHT_BY_SYMBOL[a.symbol],
    }));
}
