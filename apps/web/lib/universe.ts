/**
 * The asset universe, read from AssetRegistry rather than hard-coded.
 *
 * Asset CLASS (growth / defensive / liquid) is the one piece of metadata the registry does not
 * store, because it is an allocation-planning concept rather than a protocol rule. It is derived
 * from the on-chain registry's `isLiquid` flag plus the domain asset registry, and any unknown asset
 * defaults to `defensive` — the conservative choice.
 */
import { AssetRegistryAbi, requireContract, type Deployment } from "@modalis/chain";
import type { UniverseAsset } from "@modalis/ai";
import { ASSETS } from "@modalis/domain";
import type { Address, PublicClient } from "viem";

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
      // From the asset registry; an unregistered asset falls back to the conservative choice.
      assetClass: ASSETS[a.symbol]?.assetClass ?? (a.isLiquid ? "liquid" : "defensive"),
      isLiquid: a.isLiquid,
      assetMaxBps: Number(a.maxBps),
      classWeight: ASSETS[a.symbol]?.plannerWeight,
    }));
}
