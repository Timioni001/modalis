/**
 * GET /api/status — what this deployment can actually do.
 *
 * Exists to keep the product honest. It reports what is really wired up, so an unconfigured
 * integration shows as unconfigured rather than as a logo, and a UI can disable an action with a
 * real reason instead of failing on press.
 *
 * Public: it exposes no personal data and no secret, only deployment facts and public addresses.
 */
import {
  agentIdentity,
  agentLabel,
  deployedIntegrations,
} from "@modalis/chain";
import { authConfigFromEnv, isAuthConfigured } from "@modalis/auth";
import type { Capabilities } from "@modalis/domain";
import { getServerContext, isDemoMode } from "@/lib/server";
import { jsonResponse } from "@/lib/serialize";
import { publicConfig } from "@/lib/public-config";
import { inspectIntegrations } from "@/lib/integration-health";
import { rateLimit, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
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

    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    if (fresh)
      await rateLimit(request, "status:refresh", { max: 12, windowMs: 60_000 });
    const health = await inspectIntegrations(
      { deployment, deployed, client, rpc },
      fresh,
    );
    const pricesReady = reachable && health.pricesReady;
    const signInReady = isAuthConfigured(auth) && health.authHealthy;
    const agent = agentIdentity();
    const managerReady = health.agentHealthy;
    const tradingReady = false; // A configured adapter is not proof of a real market fill.

    const limitations: string[] = [];
    if (!deployed)
      limitations.push("Modalis isn't set up on this network yet.");
    if (!reachable) limitations.push("We can't reach the network right now.");
    if (!signInReady && !auth.allowDevAuth)
      limitations.push(
        "Signing in isn't configured, so nothing can be saved or changed.",
      );
    if (!pricesReady && deployed && reachable)
      limitations.push(
        health.recovery.canRefresh
          ? "Demo prices need a refresh. The app can restore them when you open your account."
          : "Portfolio prices need the demo operator's attention. Payments, saved plans and manual calculations remain available.",
      );
    if (!health.dbHealthy)
      limitations.push("Your goal and history won't be saved.");

    const capabilities: Capabilities = {
      canCreatePlan: deployed && reachable,
      canFund:
        deployed &&
        reachable &&
        (pricesReady || health.recovery.canRefresh) &&
        (signInReady || auth.allowDevAuth),
      canAdjust:
        deployed &&
        reachable &&
        (pricesReady || health.recovery.canRefresh) &&
        managerReady &&
        (signInReady || auth.allowDevAuth),
      limitations,
    };

    return jsonResponse({
      network: {
        name: cfg.networkName,
        chainId: deployment.chainId,
        reachable,
        blockNumber,
      },
      ready: deployed,
      developmentLocal:
        process.env.NODE_ENV !== "production" &&
        process.env.MODALIS_LOCAL_DEVELOPMENT === "true",
      prices: { ready: pricesReady, recovery: health.recovery },
      readiness:
        !reachable || !deployed
          ? "offline"
          : pricesReady &&
              health.dbHealthy &&
              health.cashReady &&
              (signInReady || auth.allowDevAuth)
            ? "ready"
            : "limited",
      checkedAt: health.checkedAt,
      integrations: health.integration,
      features: {
        payments: deployed && reachable && health.cashReady,
        directSaving: deployed && reachable && health.cashReady,
        circles: health.circlesHealthy,
        savedGoals: health.dbHealthy,
      },
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
        signIn: signInReady && !auth.allowDevAuth,
        agentWallet: agent?.kind === "dynamic" && health.agentHealthy,
        trading: tradingReady,
        independentMonitoring: false,
        history: health.indexerHealthy,
        network: health.alchemyHealthy,
        explanations: false,
        savedData: health.dbHealthy,
      },
      trading: tradingReady
        ? { live: true }
        : integrations.demoAdapter
          ? {
              live: false,
              note: "Trades run through a test fixture on this deployment, not a real venue.",
            }
          : null,
      demoMode: isDemoMode(),
      // Public addresses only. Kept out of the product vocabulary but available for verification.
      technical: {
        contracts: deployment.contracts,
        tokens: deployment.tokens,
        managerAddress: managerAddress(),
        // Who signs adjustments: "Dynamic server wallet" or "Modalis key".
        agent: agent
          ? {
              address: agent.address,
              kind: agent.kind,
              label: agentLabel(agent.kind),
            }
          : null,
      },
    });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err && err.status === 429)
      return handleError(err);
    return jsonResponse({
      network: {
        name: cfg.networkName,
        chainId: cfg.chainId,
        reachable: false,
        blockNumber: null,
      },
      ready: false,
      capabilities: {
        canCreatePlan: false,
        canFund: false,
        canAdjust: false,
        limitations: ["We can't reach the network right now."],
      },
      error:
        "Deployment checks failed. Check the server configuration and try again.",
    });
  }
}

/** Public address only. The private key never leaves the server. */
function managerAddress(): string | null {
  const explicit = process.env.MANAGER_ADDRESS?.trim();
  if (explicit) return explicit;
  return agentIdentity()?.address ?? null;
}
