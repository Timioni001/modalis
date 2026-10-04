"use client";

/**
 * Shared portfolio state for the dashboard pages.
 *
 * One fetch of live chain state, refreshed on demand after an action settles. Everything is read
 * from the contracts each time — there is no client-side cache of balances, because a stale
 * balance in a wealth product is worse than a spinner.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useWallet } from "./wallet-context";
import type { ApiPortfolioResponse, ApiRiskResponse, ApiStatus } from "@/lib/api-types";

type PortfolioContextValue = {
  address: string | null;
  loggedIn: boolean;
  walletConfigured: boolean;
  status: ApiStatus | null;
  portfolio: ApiPortfolioResponse | null;
  risk: ApiRiskResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<PortfolioContextValue>({
  address: null,
  loggedIn: false,
  walletConfigured: false,
  status: null,
  portfolio: null,
  risk: null,
  loading: true,
  error: null,
  refresh: async () => {},
});

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { address, loggedIn, configured } = useWallet();
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [portfolio, setPortfolio] = useState<ApiPortfolioResponse | null>(null);
  const [risk, setRisk] = useState<ApiRiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const s = (await fetch("/api/status").then((r) => r.json())) as ApiStatus;
      setStatus(s);

      if (!address) {
        setPortfolio(null);
        setRisk(null);
        return;
      }
      if (!s.deployed) {
        setError("Modalis is not deployed on this chain yet.");
        return;
      }

      const p = (await fetch(`/api/portfolio/${address}`).then((r) => r.json())) as ApiPortfolioResponse;
      setPortfolio(p);
      if (p.error) setError(p.error);

      if (p.hasMandate) {
        const r = (await fetch(`/api/risk/${address}`).then((res) => res.json())) as ApiRiskResponse;
        setRisk(r);
      } else {
        setRisk(null);
      }
    } catch {
      setError("Could not reach the Modalis server.");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  return (
    <Ctx.Provider
      value={{ address, loggedIn, walletConfigured: configured, status, portfolio, risk, loading, error, refresh }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePortfolio(): PortfolioContextValue {
  return useContext(Ctx);
}
