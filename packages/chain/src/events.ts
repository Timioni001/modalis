/**
 * Portfolio event access.
 *
 * Two paths, for two different jobs:
 *   - watch*: live Alchemy WebSocket subscriptions, so the dashboard reflects settlement within
 *     a block or two rather than on a polling timer.
 *   - fetch*: historical log queries, used as the fallback when the Envio indexer is not
 *     configured. Envio remains the right tool for deep history; this keeps the app functional
 *     without it.
 */
import { parseAbiItem, type Address, type Hex, type Log, type PublicClient } from "viem";
import { requireContract, type Deployment } from "./addresses.ts";

export const EVENT_ABIS = {
  Deposited: parseAbiItem("event Deposited(address indexed owner, address indexed token, uint256 amount)"),
  Withdrawn: parseAbiItem("event Withdrawn(address indexed owner, address indexed token, uint256 amount)"),
  TradeSettled: parseAbiItem(
    "event TradeSettled(address indexed owner, address indexed adapter, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)",
  ),
  Rebalanced: parseAbiItem(
    "event Rebalanced(address indexed owner, uint32 indexed mandateVersion, uint256 indexed nonce, address adapter, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, bytes32 reasonHash)",
  ),
  AllocationSnapshot: parseAbiItem(
    "event AllocationSnapshot(address indexed owner, uint256 indexed nonce, address[] tokens, uint256[] bpsBefore, uint256[] bpsAfter)",
  ),
  MandateActiveSet: parseAbiItem(
    "event MandateActiveSet(address indexed owner, uint32 indexed version, bool active)",
  ),
  ManagerSet: parseAbiItem("event ManagerSet(address indexed owner, address indexed manager)"),
  RiskStateUpdated: parseAbiItem(
    "event RiskStateUpdated(address indexed owner, uint8 status, uint32 mandateVersion, uint256 maxDriftBps, uint256 totalValue, bytes32 reasonHash)",
  ),
  RebalanceRequired: parseAbiItem(
    "event RebalanceRequired(address indexed owner, uint8 status, uint32 mandateVersion, bytes32 reasonHash)",
  ),
} as const;

export type EventName = keyof typeof EVENT_ABIS;

/** Which deployed contract emits each event. */
const EVENT_SOURCE: Record<EventName, "portfolioVault" | "rebalanceExecutor" | "portfolioMandate" | "riskSignalReceiver"> = {
  Deposited: "portfolioVault",
  Withdrawn: "portfolioVault",
  TradeSettled: "portfolioVault",
  Rebalanced: "rebalanceExecutor",
  AllocationSnapshot: "rebalanceExecutor",
  MandateActiveSet: "portfolioMandate",
  ManagerSet: "portfolioMandate",
  RiskStateUpdated: "riskSignalReceiver",
  RebalanceRequired: "riskSignalReceiver",
};

export function eventAddress(deployment: Deployment, name: EventName): Address {
  return requireContract(deployment, EVENT_SOURCE[name]);
}

/**
 * Subscribes to one event for one owner. Returns the unwatch function.
 * Requires a WebSocket-capable client (see createMonadWebSocketClient).
 */
export function watchOwnerEvent<N extends EventName>(
  client: PublicClient,
  deployment: Deployment,
  name: N,
  owner: Address,
  onLogs: (logs: Log[]) => void,
): () => void {
  return client.watchEvent({
    address: eventAddress(deployment, name),
    event: EVENT_ABIS[name] as never,
    args: { owner } as never,
    onLogs: (logs) => onLogs(logs as Log[]),
  });
}

export async function fetchOwnerEvent<N extends EventName>(
  client: PublicClient,
  deployment: Deployment,
  name: N,
  owner: Address,
  opts: { fromBlock?: bigint; toBlock?: bigint } = {},
): Promise<Log[]> {
  const logs = await client.getLogs({
    address: eventAddress(deployment, name),
    event: EVENT_ABIS[name] as never,
    args: { owner } as never,
    fromBlock: opts.fromBlock ?? (deployment.blockNumber ? BigInt(deployment.blockNumber) : 0n),
    toBlock: opts.toBlock ?? "latest",
  });
  return logs as Log[];
}

export type ActivityItem = {
  kind: EventName;
  blockNumber: bigint;
  txHash: Hex;
  logIndex: number;
  args: Record<string, unknown>;
};

/**
 * The portfolio's full on-chain activity, newest first. Used by /portfolio/activity when Envio
 * is not configured; with Envio configured the UI prefers the indexer's GraphQL.
 */
export async function fetchActivity(
  client: PublicClient,
  deployment: Deployment,
  owner: Address,
  opts: { fromBlock?: bigint } = {},
): Promise<ActivityItem[]> {
  const names: EventName[] = ["Deposited", "Withdrawn", "Rebalanced", "TradeSettled", "MandateActiveSet"];
  const available = names.filter((n) => Boolean(deployment.contracts[EVENT_SOURCE[n]]));

  const batches = await Promise.all(
    available.map(async (name) => {
      const logs = await fetchOwnerEvent(client, deployment, name, owner, opts);
      return logs.map((l) => ({
        kind: name,
        blockNumber: l.blockNumber ?? 0n,
        txHash: l.transactionHash as Hex,
        logIndex: l.logIndex ?? 0,
        args: ((l as unknown as { args?: Record<string, unknown> }).args ?? {}),
      }));
    }),
  );

  return batches
    .flat()
    .sort((a, b) =>
      a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : Number(b.blockNumber - a.blockNumber),
    );
}
