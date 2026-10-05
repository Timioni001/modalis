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
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setStatus(await apiGet<SystemStatus>("/api/status"));
    } catch {
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
      const { plan: live } = await apiGet<{ plan: Plan }>("/api/plan");
      setPlan(live);
      setNeedsPlan(false);
    } catch (err) {
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
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
      return;
    }

    // Each of these is useful on its own, so one failing should not blank the others.
    const [m, p, s, a, g] = await Promise.allSettled([
      apiGet<{ money: MoneyView }>("/api/money"),
      apiGet<{ progress: Progress }>("/api/progress"),
      apiGet<PlanStatusView>("/api/plan/status"),
      apiGet<{ adjustment: Adjustment }>("/api/adjustment"),
      apiGet<GoalView>("/api/goal"),
    ]);
    if (m.status === "fulfilled") setMoney(m.value.money);
    if (p.status === "fulfilled") setProgress(p.value.progress);
    if (s.status === "fulfilled") setPlanStatus(s.value);
    if (a.status === "fulfilled") setAdjustment(a.value.adjustment);
    if (g.status === "fulfilled") setGoal(g.value);

    setLoading(false);
  }, [address, loggedIn]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  return (
    <Ctx.Provider
      value={{
        address,
        signedIn: loggedIn,
        walletConfigured: configured,
        status,
        plan,
        goal,
        money,
        progress,
        planStatus,
        adjustment,
        needsPlan,
        loading,
        error,
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
