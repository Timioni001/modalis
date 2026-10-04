import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The workspace packages ship TypeScript source rather than build output, so Next compiles them
  // as part of the app. That keeps one source of truth for the contract ABIs and the portfolio
  // engine instead of a separate build step that could go stale.
  transpilePackages: [
    "@modalis/ai",
    "@modalis/chain",
    "@modalis/execution",
    "@modalis/portfolio",
    "@modalis/risk-monitor",
  ],
  typedRoutes: false,
};

export default nextConfig;
