"use client";

/**
 * Risk and mandate status.
 *
 * Every rule the user approved, with the portfolio's current value against it, and whether it
 * holds. The point of this page is that "risk" is not a score Modalis invented — it is the
 * distance between the portfolio and limits the user set.
 */
import { Badge, Card, KeyValue, Notice, SectionTitle, Stat } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { AllocationTable } from "@/components/allocation-table";
import { riskLabel, riskTone } from "@/lib/api-types";
import { pct, pctRound, shortAddress, targetDateLabel, usd } from "@/lib/format";

export default function RiskPage() {
  return (
    <PortfolioGate>
      <RiskView />
    </PortfolioGate>
  );
}

const VIOLATION_COPY: Record<string, string> = {
  MAX_ALLOCATION_EXCEEDED: "A single asset is above the limit you approved.",
  ALLOCATION_ABOVE_RANGE: "A holding is above the top of its approved range.",
  ALLOCATION_BELOW_MIN: "A holding is below the bottom of its approved range.",
  MIN_LIQUIDITY_BREACHED: "Your cash reserve is below the minimum you set.",
};

function RiskView() {
  const { portfolio } = usePortfolio();
  const state = portfolio?.state;
  const risk = portfolio?.risk;
  if (!state || !risk) return null;

  const m = state.mandate;
  const checks: { label: string; value: string; limit: string; ok: boolean }[] = [
    {
      label: "Largest single holding",
      value: pct(risk.largestPositionBps),
      limit: `at most ${pctRound(m.maxSingleAssetBps)}`,
      ok: risk.largestPositionBps <= m.maxSingleAssetBps,
    },
    {
      label: "Cash reserve",
      value: pct(risk.liquidityBps),
      limit: `at least ${pctRound(m.minLiquidityBps)}`,
      ok: risk.liquidityBps >= m.minLiquidityBps,
    },
    {
      label: "Largest drift from target",
      value: pct(risk.maxDriftBps),
      limit: `acts above ${pctRound(m.rebalanceThresholdBps)}`,
      ok: risk.maxDriftBps <= m.rebalanceThresholdBps,
    },
    {
      label: "Every holding inside its range",
      value: risk.violations.some((v) => v.code !== "MIN_LIQUIDITY_BREACHED") ? "No" : "Yes",
      limit: "required",
      ok: !risk.violations.some((v) => v.code !== "MIN_LIQUIDITY_BREACHED"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Risk &amp; mandate</h1>
          <p className="mt-2 max-w-2xl text-ink-soft">{portfolio?.riskSummary}</p>
        </div>
        <Badge tone={riskTone(risk.status)}>{riskLabel(risk.status)}</Badge>
      </div>

      {risk.violations.length > 0 ? (
        <Notice tone="breach" title="Your portfolio is outside a rule you approved">
          <ul className="mt-1 space-y-1">
            {risk.violations.map((v, i) => (
              <li key={`${v.code}-${i}`}>
                <strong>{v.code}</strong> &mdash; {VIOLATION_COPY[v.code] ?? "A mandate rule is breached."}{" "}
                Currently {pct(v.bps)} against a {pct(v.limitBps)} limit.
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Modalis will propose a correction, and the contract will only accept it if the result is
            back inside your rules.
          </p>
        </Notice>
      ) : null}

      {/* ----------------------------------------------------------- checks */}
      <Card>
        <SectionTitle hint="Each rule, and where the portfolio stands against it right now.">
          Mandate checks
        </SectionTitle>
        <ul className="divide-y divide-line">
          {checks.map((c) => (
            <li key={c.label} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium text-ink">{c.label}</div>
                <div className="text-xs text-ink-muted">{c.limit}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="numeric font-semibold text-ink">{c.value}</span>
                <Badge tone={c.ok ? "ok" : "breach"}>{c.ok ? "Holds" : "Breached"}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------------- the policy */}
        <Card>
          <SectionTitle hint={`Mandate version ${m.version}. Only you can change it.`}>
            The policy you approved
          </SectionTitle>
          <dl>
            <KeyValue label="Goal">{usd(BigInt(m.targetValue), { decimals: 0 })}</KeyValue>
            <KeyValue label="Target date">{targetDateLabel(m.targetDate)}</KeyValue>
            <KeyValue label="Maximum drawdown">{pctRound(m.maxDrawdownBps)}</KeyValue>
            <KeyValue label="Liquidity reserve (minimum)">{pctRound(m.minLiquidityBps)}</KeyValue>
            <KeyValue label="Maximum in any single asset">{pctRound(m.maxSingleAssetBps)}</KeyValue>
            <KeyValue label="Rebalance threshold">{pctRound(m.rebalanceThresholdBps)}</KeyValue>
            <KeyValue label="Maximum trade slippage">{pct(m.maxSlippageBps)}</KeyValue>
            <KeyValue label="Status">{m.active ? "Active" : "Paused"}</KeyValue>
          </dl>
        </Card>

        {/* -------------------------------------------------------- authority */}
        <Card>
          <SectionTitle hint="Who can do what. Enforced by the contracts, not by policy.">
            Authority
          </SectionTitle>
          <dl>
            <KeyValue label="Portfolio owner">{shortAddress(state.owner)}</KeyValue>
            <KeyValue label="Can withdraw">Owner only</KeyValue>
            <KeyValue label="Can change this mandate">Owner only</KeyValue>
            <KeyValue label="Rebalance proposals">
              {portfolio?.manager && portfolio.manager !== "0x0000000000000000000000000000000000000000"
                ? shortAddress(portfolio.manager)
                : "Not authorised"}
            </KeyValue>
            <KeyValue label="Manager can withdraw">No</KeyValue>
            <KeyValue label="Manager can edit rules">No</KeyValue>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            The manager key can call one function: submit a rebalance proposal. Every proposal is
            re-checked against this mandate on-chain, and a proposal that would leave the portfolio
            outside your rules reverts the entire transaction.
          </p>
        </Card>
      </div>

      <Card>
        <SectionTitle>Holdings against their ranges</SectionTitle>
        <AllocationTable />
      </Card>

      <Card>
        <SectionTitle>Where the risk state comes from</SectionTitle>
        <div className="grid gap-5 sm:grid-cols-3">
          <Stat label="Risk state" value={riskLabel(risk.status)} tone={riskTone(risk.status)} size="md" />
          <Stat label="Largest drift" value={pct(risk.maxDriftBps)} size="md" />
          <Stat label="Cash reserve" value={pct(risk.liquidityBps)} size="md" />
        </div>
        <p className="mt-5 text-sm leading-relaxed text-ink-soft">
          These numbers are computed from your real on-chain balances valued through the asset
          registry&rsquo;s oracle &mdash; the same inputs, and the same calculation, the mandate
          contract uses when it validates a trade. When Chainlink CRE is configured, the identical
          calculation runs across a decentralised oracle network and publishes the result on-chain,
          so the portfolio&rsquo;s risk state carries consensus rather than our word for it.
        </p>
      </Card>
    </div>
  );
}
