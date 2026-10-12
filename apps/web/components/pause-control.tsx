"use client";

/**
 * Stop Modalis, in one tap.
 *
 * The pause is signed by the owner's own wallet and written to the contract that holds their
 * limits — it is NOT a flag this app sets on a server. That matters: a server-side switch would
 * mean Modalis's own backend decides whether Modalis is allowed to act, which is exactly the
 * authority this product claims not to have. The onchain call is the whole point.
 *
 * It is a shared component because it belongs on more than one screen. Someone who wants to stop
 * the thing should find the control wherever they happen to be looking.
 */
import { useState } from "react";
import { toast } from "sonner";
import { setMandateActive } from "@modalis/chain";
import type { Address } from "viem";
import { Button } from "./ui";
import { apiPostOnce } from "@/lib/client-api";
import { usePortfolio } from "./portfolio-provider";
import { useWallet, useWalletConfig } from "./wallet-context";
import { confirmOnChain, secondsLabel } from "@/lib/chain-client";

export function PauseControl({ variant }: { variant?: "danger" | "secondary" }) {
  const { chainId, rpcUrl } = useWalletConfig();
  const { loggedIn, getWalletClient } = useWallet();
  const { plan, status, refresh } = usePortfolio();
  const [busy, setBusy] = useState(false);

  if (!plan) return null;
  const paused = plan.status === "paused";

  async function toggle() {
    setBusy(true);
    try {
      const wallet = await getWalletClient();
      const contracts = (status?.technical?.contracts ?? {}) as Record<string, Address>;
      if (!contracts.portfolioVault) {
        throw new Error("Modalis isn't set up on this network yet.");
      }
      const hash = await setMandateActive(
        wallet,
        { chainId, contracts, tokens: (status?.technical?.tokens ?? {}) as Record<string, Address> },
        paused,
      );
      const confirmed = await confirmOnChain(hash, { chainId, rpcUrl });
      // Recorded after the fact, and verified on-chain by the server before it is believed.
      await apiPostOnce("/api/money/confirm", { receipt: hash, kind: paused ? "resume" : "pause" }).catch(() => undefined);
      await refresh();
      toast.success(
        paused
          ? `Your plan is running again. Confirmed in ${secondsLabel(confirmed.ms)}.`
          : `Paused, confirmed in ${secondsLabel(confirmed.ms)}. Modalis won't act until you resume; you can still withdraw.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={variant ?? (paused ? "secondary" : "danger")}
      onClick={toggle}
      busy={busy}
      busyLabel={paused ? "Resuming…" : "Pausing…"}
      disabled={!loggedIn}
    >
      {paused ? "Resume my plan" : "Pause my plan"}
    </Button>
  );
}
