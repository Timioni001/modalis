/**
 * GET /api/status — what this deployment can actually do.
 *
 * Exists to keep the product honest. It reports what is really wired up, so an unconfigured
 * integration shows as unconfigured rather than as a logo, and a UI can disable an action with a
 * real reason instead of failing on press.
 *
 * Public: it exposes no personal data and no secret, only deployment facts and public addresses.
 */
import { AssetRegistryAbi, agentIdentity, agentLabel, deployedIntegrations } from "@modalis/chain";
import { authConfigFromEnv, isAuthConfigured } from "@modalis/auth";
import { isServerDbConfigured } from "@modalis/db";
import type { Capabilities } from "@modalis/domain";
import { getServerContext, isDemoMode } from "@/lib/server";
import { jsonResponse } from "@/lib/serialize";
import { publicConfig } from "@/lib/public-config";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const cfg = publicConfig();
  const auth = authConfigFromEnv();

  try {
    const { deployment, deployed, client, rpc } = await getServerContext();
    const integrations = deployedIntegrations(deployment);

    let blockNumber: bigint | null = null;
    let reachable = true;
    try {
      blockNumber = await client.getBlockNumber();
    } catch {
      reachable = false;
    }

    let pricesReady = reachable && deployed;
    if (pricesReady && deployment.tokens.mUSD && deployment.contracts.assetRegistry) {
      try {
        await client.readContract({ address: deployment.contracts.assetRegistry, abi: AssetRegistryAbi,
          functionName: "value", args: [deployment.tokens.mUSD, 1n] });
      } catch { pricesReady = false; }
    }
    const tradingReady = integrations.kuru && Boolean(process.env.KURU_API_URL?.trim() && rpc.httpUrl);
    const signInReady = isAuthConfigured(auth);
    const agent = agentIdentity();
    const managerReady = agent !== null;

    const limitations: string[] = [];
    if (!deployed) limitations.push("Modalis isn't set up on this network yet.");
    if (!reachable) limitations.push("We can't reach the network right now.");
    if (!signInReady && !auth.allowDevAuth) limitations.push("Signing in isn't configured, so nothing can be saved or changed.");
    if (!pricesReady && deployed && reachable) limitations.push("Current prices are unavailable. Refresh the demo oracle before funding or adjusting.");
    if (!managerReady) limitations.push("Modalis can't make adjustments on this deployment.");
    if (!isServerDbConfigured()) limitations.push("Your goal and history won't be saved.");

    const capabilities: Capabilities = {
      canCreatePlan: deployed && reachable,
      canFund: deployed && reachable && pricesReady && (signInReady || auth.allowDevAuth),
      canAdjust: deployed && reachable && pricesReady && managerReady && (signInReady || auth.allowDevAuth),
      limitations,
    };

    return jsonResponse({
      network: { name: cfg.networkName, chainId: deployment.chainId, reachable, blockNumber },
      ready: deployed,
      developmentLocal: process.env.NODE_ENV !== "production" && process.env.MODALIS_LOCAL_DEVELOPMENT === "true",
      prices: { ready: pricesReady },
      capabilities,
      signIn: {
        configured: signInReady,
        // Surfaced deliberately: a deployment running the development bypass should never be
        // able to hide that fact.
        developmentBypassEnabled: auth.allowDevAuth,
      },
      // Named for what each one does for the person, not for what it is.
      poweredBy: {
        settlement: deployed,
        signIn: Boolean(cfg.dynamicEnvironmentId),
        agentWallet: agent?.kind === "dynamic",
        trading: tradingReady,
        independentMonitoring: integrations.cre,
        history: Boolean(process.env.ENVIO_GRAPHQL_URL),
        network: Boolean(process.env.NEXT_PUBLIC_ALCHEMY_API_KEY),
        explanations: Boolean(process.env.AI_API_KEY),
        savedData: isServerDbConfigured(),
      },
      trading: tradingReady
        ? { live: true }
        : integrations.demoAdapter
          ? { live: false, note: "Trades run through a test fixture on this deployment, not a real venue." }
          : null,
      demoMode: isDemoMode(),
      // Public addresses only. Kept out of the product vocabulary but available for verification.
      technical: {
        contracts: deployment.contracts,
        tokens: deployment.tokens,
        managerAddress: managerAddress(),
        // Who signs adjustments: "Dynamic server wallet" or "Modalis key".
        agent: agent ? { address: agent.address, kind: agent.kind, label: agentLabel(agent.kind) } : null,
      },
    });
  } catch (err) {
    return jsonResponse({
      network: { name: cfg.networkName, chainId: cfg.chainId, reachable: false, blockNumber: null },
      ready: false,
      capabilities: { canCreatePlan: false, canFund: false, canAdjust: false, limitations: ["We can't reach the network right now."] },
      error: "Deployment checks failed. Check the server configuration and try again.",
    });
  }
}

/** Public address only. The private key never leaves the server. */
function managerAddress(): string | null {
  const explicit = process.env.MANAGER_ADDRESS?.trim();
  if (explicit) return explicit;
  return agentIdentity()?.address ?? null;
}
