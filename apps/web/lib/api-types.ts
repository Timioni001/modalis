/**
 * The shape of /api/status.
 *
 * The domain models (Plan, MoneyView, Progress, Adjustment, ActivityItem) come straight from
 * `@modalis/domain`, so there is no second copy to drift. Only this deployment-status shape,
 * which is an API concern rather than a domain concept, lives here.
 */
export type SystemStatus = {
  network: { name: string; chainId: number; reachable: boolean; blockNumber: string | null };
  ready: boolean;
  capabilities: {
    canCreatePlan: boolean;
    canFund: boolean;
    canAdjust: boolean;
    limitations: string[];
  };
  signIn?: { configured: boolean; developmentBypassEnabled: boolean };
  /** What this deployment has wired up, named for what each does for the person. */
  poweredBy?: {
    settlement: boolean;
    signIn: boolean;
    /** Adjustments are signed by a Dynamic server wallet. */
    agentWallet?: boolean;
    trading: boolean;
    independentMonitoring: boolean;
    history: boolean;
    network: boolean;
    explanations: boolean;
    savedData: boolean;
  };
  trading?: { live: boolean; note?: string } | null;
  demoMode?: boolean;
  /** Public addresses, for verification. Not part of the product vocabulary. */
  technical?: {
    contracts: Record<string, string>;
    tokens: Record<string, string>;
    managerAddress: string | null;
    /** The wallet that signs adjustments, and how it is held. */
    agent?: { address: string; kind: "dynamic" | "key"; label: string } | null;
  };
  error?: string;
};

export const planHealthLabel = (health?: string): string =>
  health === "on_plan"
    ? "On plan"
    : health === "drifting"
      ? "Drifting"
      : health === "off_plan"
        ? "Off plan"
        : "Unknown";

export const planHealthTone = (health?: string): "ok" | "warn" | "breach" | "default" =>
  health === "on_plan" ? "ok" : health === "drifting" ? "warn" : health === "off_plan" ? "breach" : "default";
