/**
 * GET /api/status — what is actually wired up.
 *
 * The UI uses this to tell the truth about itself: which integrations are live, which venue will
 * settle a trade, and whether a key is configured. A feature that is not configured is shown as
 * not configured rather than hidden or faked.
 */
import { accountFromPrivateKey, deployedIntegrations } from "@modalis/chain";
import { getServerContext, isDemoMode } from "@/lib/server";
import { jsonResponse } from "@/lib/serialize";
import { publicConfig } from "@/lib/public-config";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const cfg = publicConfig();

  try {
    const { deployment, deployed, client } = await getServerContext();
    const integrations = deployedIntegrations(deployment);

    let blockNumber: bigint | null = null;
    let reachable = true;
    try {
      blockNumber = await client.getBlockNumber();
    } catch {
      reachable = false;
    }

    return jsonResponse({
      chainId: deployment.chainId,
      networkName: cfg.networkName,
      rpcReachable: reachable,
      blockNumber,
      deployed,
      contracts: deployment.contracts,
      tokens: deployment.tokens,
      integrations: {
        monad: deployed,
        dynamic: Boolean(cfg.dynamicEnvironmentId),
        kuru: integrations.kuru,
        chainlinkCre: integrations.cre,
        envio: Boolean(process.env.ENVIO_GRAPHQL_URL),
        alchemy: Boolean(process.env.NEXT_PUBLIC_ALCHEMY_API_KEY),
        ai: Boolean(process.env.AI_API_KEY),
      },
      executionVenue: integrations.kuru
        ? { name: "kuru", isDemoVenue: false }
        : integrations.demoAdapter
          ? { name: "mock", isDemoVenue: true }
          : null,
      managerConfigured: Boolean(process.env.MANAGER_PRIVATE_KEY),
      // Public address only. The user authorises THIS address to submit rebalance proposals, so
      // the browser needs it; the private key never leaves the server.
      managerAddress: managerAddress(),
      demoMode: isDemoMode(),
    });
  } catch (err) {
    return jsonResponse({
      chainId: cfg.chainId,
      networkName: cfg.networkName,
      rpcReachable: false,
      deployed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * The manager's public address, from MANAGER_ADDRESS or derived from the key. Returns null when
 * no manager is configured, so the UI can say "rebalance proposals are not configured" instead of
 * asking the user to authorise nothing.
 */
function managerAddress(): string | null {
  const explicit = process.env.MANAGER_ADDRESS?.trim();
  if (explicit) return explicit;
  const key = process.env.MANAGER_PRIVATE_KEY;
  if (!key) return null;
  try {
    return accountFromPrivateKey(key).address;
  } catch {
    return null;
  }
}
