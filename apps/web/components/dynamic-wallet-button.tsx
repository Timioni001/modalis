"use client";
import { useDynamicContext, useIsLoggedIn } from "@dynamic-labs/sdk-react-core";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatEther, formatUnits, type Address } from "viem";
import { MockERC20Abi } from "@modalis/chain";
import { browserClient } from "@/lib/chain-client";
import { apiGet } from "@/lib/client-api";
import type { SystemStatus } from "@/lib/api-types";
import { shortAddress } from "@/lib/format";
import { Button } from "./ui";
import { useWalletConfig } from "./wallet-context";
import { toast } from "sonner";

export function ConfiguredWalletButton({
  compact = false,
}: {
  compact?: boolean;
}) {
  return <CompactAccount compact={compact} />;
}
/** Signed in: a compact account control with balances and wallet actions. */
function CompactAccount({ compact }: { compact: boolean }) {
  const { setShowDynamicUserProfile, setShowAuthFlow, primaryWallet, user } =
    useDynamicContext();
  const loggedIn = useIsLoggedIn();
  const { chainId, networkName, rpcUrl, explorerUrl } = useWalletConfig();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<{
    native: bigint;
    usd: bigint | null;
  } | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const shell = useRef<HTMLDivElement>(null);

  const label = user?.email ?? primaryWallet?.address ?? "Your account";
  const initial = (
    user?.email?.[0] ??
    primaryWallet?.address?.[2] ??
    "?"
  ).toUpperCase();

  const address = primaryWallet?.address as Address | undefined;

  useEffect(() => {
    if (!open || !loggedIn) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (shell.current && !shell.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, loggedIn]);

  useEffect(() => {
    if (!open || !loggedIn || !address) return;
    let alive = true;
    setLoadingBalance(true);
    setBalance(null);
    const client = browserClient(chainId, rpcUrl);
    void Promise.all([
      client.getBalance({ address }),
      apiGet<SystemStatus>("/api/status").catch(() => null),
    ])
      .then(async ([native, status]) => {
        const token = status?.technical?.tokens?.mUSD as Address | undefined;
        let usd: bigint | null = null;
        if (token) {
          try {
            usd = await client.readContract({
              address: token,
              abi: MockERC20Abi,
              functionName: "balanceOf",
              args: [address],
            });
          } catch {
            usd = null;
          }
        }
        if (alive) setBalance({ native, usd });
      })
      .catch(() => {
        if (alive) setBalance(null);
      })
      .finally(() => {
        if (alive) setLoadingBalance(false);
      });
    return () => {
      alive = false;
    };
  }, [open, loggedIn, address, chainId, rpcUrl]);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Wallet address copied");
    } catch {
      toast.error("Copy was unavailable. Select the address manually.");
    }
  }

  if (!loggedIn) {
    return (
      <button
        type="button"
        onClick={() => setShowAuthFlow(true)}
        className="inline-flex h-11 flex-none items-center rounded-full bg-panel px-4 text-[13px] font-semibold text-panel-ink"
      >
        Enter testnet demo
      </button>
    );
  }

  return (
    <div ref={shell} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Your account, ${label}`}
        title={label}
        className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full bg-panel text-[13px] font-semibold text-panel-ink transition-transform duration-200 hover:scale-[1.03] active:scale-95"
      >
        {compact ? initial : "Demo account"}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="dialog"
            aria-label="Wallet account"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(350px,calc(100vw-32px))] origin-top-right rounded-3xl bg-panel p-4 text-panel-ink shadow-[var(--shadow-float)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-panel-soft">
                  Your account
                </p>
                <p className="mt-1 text-sm font-semibold">{networkName}</p>
              </div>
              <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-ink">
                Testnet
              </span>
            </div>
            <div className="mt-4 rounded-2xl bg-white/10 p-3">
              <p className="text-xs text-panel-soft">Wallet address</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate text-sm">{shortAddress(address ?? "")}</code>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="min-h-9 rounded-full bg-white/10 px-3 text-xs font-semibold transition-colors hover:bg-white/20"
                >
                  Copy
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <BalanceTile
                label="Network balance"
                value={
                  loadingBalance
                    ? "Loading…"
                    : balance
                      ? `${formatEther(balance.native)} MON`
                      : "Unavailable"
                }
              />
              <BalanceTile
                label="Demo dollars"
                value={
                  loadingBalance
                    ? "Loading…"
                    : balance?.usd == null
                      ? "Unavailable"
                      : `${formatUnits(balance.usd, 6)} mUSD`
                }
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-panel-soft">
              MON pays network fees. mUSD is demo money on Monad Testnet.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowDynamicUserProfile(true)}
              >
                Manage account
              </Button>
              {explorerUrl && address ? (
                <Button
                  variant="quiet"
                  className="text-panel-soft hover:bg-white/10 hover:text-panel-ink"
                  href={`${explorerUrl.replace(/\/$/, "")}/address/${address}`}
                >
                  View on explorer
                </Button>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function BalanceTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/10 p-3">
      <p className="text-[11px] text-panel-soft">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}
