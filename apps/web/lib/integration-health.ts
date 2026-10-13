import "server-only";
import { authConfigFromEnv } from "@modalis/auth";
import { serverClient } from "@modalis/db";
import {
  agentIdentity,
  AssetRegistryAbi,
  alchemyHttpUrl,
  networkForChainId,
} from "@modalis/chain";
import { getAgentWallet } from "@modalis/chain/agent";
import type { Address } from "viem";
import type { ServerContext } from "./server";
import { priceRecovery } from "./demo-prices";
import { fetchEnvioStats } from "./envio-stats";
import { healthRevision } from "./health-version";

export type ServiceHealth = {
  state: "healthy" | "attention" | "configured" | "not_configured" | "demo";
  label: string;
  detail: string;
};
const service = (
  state: ServiceHealth["state"],
  detail: string,
): ServiceHealth => ({
  state,
  detail,
  label: {
    healthy: "Verified",
    attention: "Needs attention",
    configured: "Evidence pending",
    not_configured: "Optional",
    demo: "Test fixture",
  }[state],
});
async function bounded<T>(action: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      action,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), 3500);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer!);
  }
}
async function json(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Service probe failed");
  return response.json();
}

let cached: {
  identity: string;
  revision: number;
  expires: number;
  value: Promise<Awaited<ReturnType<typeof inspect>>>;
} | null = null;
export function inspectIntegrations(ctx: ServerContext, fresh = false) {
  const identity = `${ctx.deployment.chainId}:${ctx.deployment.contracts.priceOracle}:${ctx.rpc.httpUrl}`;
  const revision = healthRevision();
  if (
    !fresh &&
    cached &&
    cached.identity === identity &&
    cached.revision === revision &&
    cached.expires > Date.now()
  )
    return cached.value;
  const value = inspect(ctx);
  cached = { identity, revision, expires: Date.now() + 15_000, value };
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });
  return value;
}
async function inspect(ctx: ServerContext) {
  const auth = authConfigFromEnv();
  const db = serverClient();
  const agent = agentIdentity();
  const [
    pricesReady,
    recovery,
    authHealthy,
    dbHealthy,
    indexerHealthy,
    agentHealthy,
    alchemyHealthy,
    circlesHealthy,
    cashReady,
  ] = await Promise.all([
    bounded(
      (async () => {
        if (!ctx.deployed) return false;
        const registry = ctx.deployment.contracts.assetRegistry!;
        const tokens = await ctx.client.readContract({
          address: registry,
          abi: AssetRegistryAbi,
          functionName: "listAssets",
        });
        const results = await Promise.all(
          tokens.map(async (token) => {
            const asset = await ctx.client.readContract({
              address: registry,
              abi: AssetRegistryAbi,
              functionName: "getAsset",
              args: [token],
            });
            if (!asset.enabled) return true;
            const value = await ctx.client.readContract({
              address: registry,
              abi: AssetRegistryAbi,
              functionName: "value",
              args: [token, 10n ** BigInt(asset.decimals)],
            });
            return value > 0n;
          }),
        );
        return results.length > 0 && results.every(Boolean);
      })(),
      false,
    ),
    bounded(priceRecovery(ctx), {
      enabled: false,
      canRefresh: false,
      reason: "unsupported_oracle",
    } as Awaited<ReturnType<typeof priceRecovery>>),
    auth.jwksUrl
      ? bounded(
          json(auth.jwksUrl).then(
            (body) =>
              Array.isArray(body.keys) &&
              body.keys.some((key: { kty?: string }) => key.kty),
          ),
          false,
        )
      : Promise.resolve(auth.allowDevAuth),
    db
      ? bounded(
          (async () => {
            const results = await Promise.all(
              ["goals", "interview_sessions", "mandates"].map((table) =>
                db
                  .from(table as "goals")
                  .select("id", { head: true })
                  .limit(0),
              ),
            );
            return results.every((result) => !result.error);
          })(),
          false,
        )
      : Promise.resolve(false),
    process.env.ENVIO_GRAPHQL_URL
      ? bounded(
          fetchEnvioStats(process.env.ENVIO_GRAPHQL_URL).then(Boolean),
          false,
        )
      : Promise.resolve(false),
    agent
      ? bounded(
          (async () => {
            const resolved = await getAgentWallet(ctx.rpc);
            return Boolean(
              resolved &&
                (!process.env.MANAGER_ADDRESS ||
                  resolved.address.toLowerCase() ===
                    process.env.MANAGER_ADDRESS.toLowerCase()) &&
                (await ctx.client.getBalance({ address: resolved.address })) >
                  0n,
            );
          })(),
          false,
        )
      : Promise.resolve(false),
    ctx.rpc.alchemyApiKey || /alchemy\.(com|io)/.test(ctx.rpc.httpUrl ?? "")
      ? bounded(
          (async () => {
            const url = ctx.rpc.alchemyApiKey
              ? alchemyHttpUrl(
                  networkForChainId(ctx.rpc.chainId),
                  ctx.rpc.alchemyApiKey,
                )
              : ctx.rpc.httpUrl!;
            const answer = await json(url, {
              jsonrpc: "2.0",
              id: 1,
              method: "eth_chainId",
              params: [],
            });
            return !answer.error && Number(answer.result) === ctx.rpc.chainId;
          })(),
          false,
        )
      : Promise.resolve(false),
    ctx.deployment.contracts.savingsCircle
      ? bounded(
          ctx.client
            .getCode({
              address: ctx.deployment.contracts.savingsCircle as Address,
            })
            .then((code) => Boolean(code && code !== "0x")),
          false,
        )
      : Promise.resolve(false),
    ctx.deployment.chainId === 10143 && ctx.deployment.tokens.mUSD
      ? bounded(
          (async () => {
            const asset = await ctx.client.readContract({
              address: ctx.deployment.contracts.assetRegistry!,
              abi: AssetRegistryAbi,
              functionName: "getAsset",
              args: [ctx.deployment.tokens.mUSD!],
            });
            return (
              asset.enabled &&
              asset.isLiquid &&
              asset.symbol === "mUSD" &&
              asset.decimals === 6
            );
          })(),
          false,
        )
      : Promise.resolve(false),
  ]);
  const integration = {
    settlement: service(
      ctx.deployed ? "healthy" : "attention",
      "Core contract bytecode and RPC chain are checked.",
    ),
    signIn: service(
      auth.jwksUrl
        ? authHealthy
          ? "healthy"
          : "attention"
        : auth.allowDevAuth
          ? "demo"
          : "not_configured",
      auth.jwksUrl
        ? "Signing keys are checked. A successful user session remains separate evidence."
        : "Local development authentication is not evidence of a Dynamic integration.",
    ),
    agentWallet: service(
      agent?.kind === "dynamic"
        ? agentHealthy
          ? "healthy"
          : "attention"
        : "not_configured",
      agent?.kind === "dynamic"
        ? "Server-wallet authentication, account identity and gas are checked."
        : "The consumer wallet works independently of a Dynamic server wallet.",
    ),
    trading: service(
      ctx.deployment.contracts.kuruAdapter
        ? "configured"
        : ctx.deployment.contracts.executionAdapter
          ? "demo"
          : "not_configured",
      "A real supported market and a confirmed Kuru fill are required for sponsor execution evidence.",
    ),
    independentMonitoring: service(
      ctx.deployment.contracts.riskSignalReceiver
        ? "configured"
        : "not_configured",
      "A receiver address alone does not verify a deployed CRE workflow or a fresh report.",
    ),
    history: service(
      indexerHealthy
        ? "healthy"
        : process.env.ENVIO_GRAPHQL_URL
          ? "attention"
          : "not_configured",
      indexerHealthy
        ? "The indexer answers the app's real event query. Complete sync is not inferred from this check."
        : "Receipt history can still use confirmed chain and saved records.",
    ),
    network: service(
      alchemyHealthy
        ? "healthy"
        : ctx.rpc.alchemyApiKey
          ? "attention"
          : "not_configured",
      "Alchemy is an optional RPC provider. Monad reads do not depend on choosing it.",
    ),
    explanations: service(
      process.env.AI_API_KEY ? "configured" : "demo",
      "Deterministic planning works without an AI provider. Provider use is verified when a real explanation succeeds.",
    ),
    savedData: service(
      dbHealthy ? "healthy" : db ? "attention" : "not_configured",
      "The goal, interview and mandate tables are queried; settings are compatible with the existing schema.",
    ),
  };
  return {
    checkedAt: new Date().toISOString(),
    pricesReady,
    recovery,
    authHealthy,
    dbHealthy,
    indexerHealthy,
    agentHealthy,
    alchemyHealthy,
    circlesHealthy,
    cashReady,
    integration,
  };
}
