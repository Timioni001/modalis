"use client";

/**
 * Shared plan state for the signed-in person.
 *
 * Speaks the product's language: plan, money, progress, adjustment. It no longer knows what a
 * mandate or a vault is — the domain API returns those already translated.
 *
 * Everything is read live on each refresh. A stale balance in a money product is worse than a
 * spinner, so nothing here is cached as truth.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useWallet } from "./wallet-context";
import { ApiError, apiGet } from "@/lib/client-api";
import type { Adjustment, GoalView, MoneyView, Plan, Progress } from "@modalis/domain";
import type { SystemStatus } from "@/lib/api-types";

type PlanStatusView = {
  health: "on_plan" | "drifting" | "off_plan";
  summary: string;
  furthestOffTargetPercent: number;
  availableMoneyPercent: number;
  largestHoldingPercent: number;
  needsAdjustment: boolean;
};

type ContextValue = {
  address: string | null;
  signedIn: boolean;
  walletConfigured: boolean;
  status: SystemStatus | null;
  plan: Plan | null;
  goal: GoalView | null;
  money: MoneyView | null;
  progress: Progress | null;
  planStatus: PlanStatusView | null;
  adjustment: Adjustment | null;
  /** True when the person is signed in but has not made a plan yet. */
  needsPlan: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<ContextValue>({
  address: null,
  signedIn: false,
  walletConfigured: false,
  status: null,
  plan: null,
  goal: null,
  money: null,
  progress: null,
  planStatus: null,
  adjustment: null,
  needsPlan: false,
  loading: true,
  error: null,
  refresh: async () => {},
});

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { address, loggedIn, configured } = useWallet();
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [goal, setGoal] = useState<GoalView | null>(null);
  const [money, setMoney] = useState<MoneyView | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [planStatus, setPlanStatus] = useState<PlanStatusView | null>(null);
  const [adjustment, setAdjustment] = useState<Adjustment | null>(null);
  const [needsPlan, setNeedsPlan] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeRequest = useRef<AbortController | null>(null);
  const clearPlan = useCallback(() => {
    setPlan(null); setGoal(null); setMoney(null); setProgress(null);
    setPlanStatus(null); setAdjustment(null); setNeedsPlan(false);
  }, []);
  const refresh = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const signal = controller.signal;
    setLoading(true);
    setLoadedFor(address);
    setError(null);
    try {
      const currentStatus = await apiGet<SystemStatus>("/api/status", signal);
      if (signal.aborted) return;
      setStatus(currentStatus);
    } catch {
      if (signal.aborted) return;
      clearPlan();
      setError("We can't reach Modalis right now.");
      setLoading(false);
      return;
    }

    if (!loggedIn || !address) {
      setPlan(null);
      setGoal(null);
      setMoney(null);
      setProgress(null);
      setPlanStatus(null);
      setAdjustment(null);
      setNeedsPlan(false);
      setLoading(false);
      return;
    }

    try {
      const { plan: live } = await apiGet<{ plan: Plan }>("/api/plan", signal);
      if (signal.aborted) return;
      setLoadedFor(address);
      setPlan(live);
      setNeedsPlan(false);
    } catch (err) {
      if (signal.aborted) return;
      setLoadedFor(address);
      // "No plan yet" is a normal state for a new person, not an error to show.
      if (err instanceof ApiError && err.code === "no_plan") {
        setNeedsPlan(true);
        setPlan(null);
        setGoal(null);
        setMoney(null);
        setProgress(null);
        setPlanStatus(null);
        setAdjustment(null);
        setLoading(false);
        return;
      }
      clearPlan();
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
      return;
    }

    // Each of these is useful on its own, so one failing should not blank the others.
    const [m, p, s, a, g] = await Promise.allSettled([
      apiGet<{ money: MoneyView }>("/api/money", signal),
      apiGet<{ progress: Progress }>("/api/progress", signal),
      apiGet<PlanStatusView>("/api/plan/status", signal),
      apiGet<{ adjustment: Adjustment }>("/api/adjustment", signal),
      apiGet<GoalView>("/api/goal", signal),
    ]);
    if (signal.aborted) return;
    setMoney(m.status === "fulfilled" ? m.value.money : null);
    setProgress(p.status === "fulfilled" ? p.value.progress : null);
    setPlanStatus(s.status === "fulfilled" ? s.value : null);
    setAdjustment(a.status === "fulfilled" ? a.value.adjustment : null);
    setGoal(g.status === "fulfilled" ? g.value : null);
    const failed = [m, p, s, a, g].filter((result) => result.status === "rejected");
    if (failed.length) {
      const first = failed.find((result) => result.status === "rejected" && result.reason instanceof ApiError);
      setError(first?.status === "rejected" ? first.reason.message : "Some current figures couldn't be loaded. Try refreshing before taking action.");
    }

    setLoading(false);
  }, [address, loggedIn, clearPlan]);

  useEffect(() => {
    clearPlan();
    setLoading(true);
    void refresh();
    return () => activeRequest.current?.abort();
  }, [refresh, clearPlan]);

  const sameAccount = loggedIn && loadedFor === address;
  return (
    <Ctx.Provider
      value={{
        address,
        signedIn: loggedIn,
        walletConfigured: configured,
        status,
        plan: sameAccount ? plan : null,
        goal: sameAccount ? goal : null,
        money: sameAccount ? money : null,
        progress: sameAccount ? progress : null,
        planStatus: sameAccount ? planStatus : null,
        adjustment: sameAccount ? adjustment : null,
        needsPlan: sameAccount && needsPlan,
        loading: loading || (loggedIn && Boolean(address) && !sameAccount),
        error: sameAccount ? error : null,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePortfolio(): ContextValue {
  return useContext(Ctx);
}
