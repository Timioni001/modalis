import { decodeEventLog, type Address, type Hex } from "viem";
import {
  MockERC20Abi,
  PortfolioMandateAbi,
  PortfolioVaultAbi,
} from "@modalis/chain";

type Action = "allow" | "add" | "withdraw" | "pause" | "resume";
/** A sender address alone does not prove a deposit. Match an actual event and its owner. */
export function receiptAction(
  receipt: {
    status: string;
    from: string;
    logs: { address: string; data: Hex; topics: readonly Hex[] }[];
  },
  owner: string,
  contracts: { vault: string; mandate: string; tokens: string[] },
  requested?: Action,
): Action | null {
  if (
    receipt.status !== "success" ||
    receipt.from.toLowerCase() !== owner.toLowerCase()
  )
    return null;
  for (const log of receipt.logs) {
    try {
      let action: Action | undefined;
      const topics = log.topics as [Hex, ...Hex[]];
      if (log.address.toLowerCase() === contracts.vault.toLowerCase()) {
        const event = decodeEventLog({
          abi: PortfolioVaultAbi,
          data: log.data,
          topics,
        });
        if (
          (event.eventName === "Deposited" ||
            event.eventName === "Withdrawn") &&
          event.args.amount > 0n &&
          event.args.owner.toLowerCase() === owner.toLowerCase()
        )
          action = event.eventName === "Deposited" ? "add" : "withdraw";
      } else if (
        log.address.toLowerCase() === contracts.mandate.toLowerCase()
      ) {
        const event = decodeEventLog({
          abi: PortfolioMandateAbi,
          data: log.data,
          topics,
        });
        if (
          event.eventName === "MandateActiveSet" &&
          event.args.owner.toLowerCase() === owner.toLowerCase()
        )
          action = event.args.active ? "resume" : "pause";
      } else if (
        contracts.tokens.some(
          (token) => token.toLowerCase() === log.address.toLowerCase(),
        )
      ) {
        const event = decodeEventLog({
          abi: MockERC20Abi,
          data: log.data,
          topics,
        });
        if (
          event.eventName === "Approval" &&
          event.args.owner.toLowerCase() === owner.toLowerCase() &&
          event.args.spender.toLowerCase() === contracts.vault.toLowerCase()
        )
          action = "allow";
      }
      if (action && (!requested || requested === action)) return action;
    } catch {
      /* An unrelated event must not make a receipt valid. */
    }
  }
  return null;
}
