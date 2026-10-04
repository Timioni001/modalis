import { publicConfig } from "@/lib/public-config";

/**
 * The regulatory boundary, stated plainly and on every page.
 *
 * Modalis is a technical demonstration of programmable, goal-based portfolio management. It is
 * not an investment adviser, broker or fund, and the demo assets are not real investments.
 */
export function SiteFooter() {
  const cfg = publicConfig();
  return (
    <footer className="mt-20 border-t border-line bg-surface-sunken">
      <div className="mx-auto max-w-6xl space-y-3 px-5 py-10 text-xs leading-relaxed text-ink-muted">
        <p className="font-semibold text-ink-soft">
          Modalis — goal-based wealth management, programmed on Monad.
        </p>
        <p>
          Prototype and technical demonstration only. Modalis is not an investment adviser, broker,
          fund or pooled investment vehicle. Nothing here is financial advice, no return is
          promised or implied, and figures shown are not projections of future performance.
        </p>
        <p>
          Demo tokens (mUSD, mBTC, mETH, mBOND) exist only on test networks and are not real
          investment assets. Portfolios are non-custodial: the owner keeps withdrawal authority at
          all times, and the Modalis manager key can only propose rebalances within the mandate.
        </p>
        <p>Connected to {cfg.networkName} (chain {cfg.chainId}).</p>
      </div>
    </footer>
  );
}
