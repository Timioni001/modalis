import type { NextConfig } from "next";
import { resolve } from "node:path";

/**
 * Response headers.
 *
 * A money product is a credential-phishing target and an embedding target, so the defaults are
 * not good enough. Each of these closes something specific:
 *
 *  - `frame-ancestors 'none'` and `X-Frame-Options` stop Modalis being framed by a page that
 *    overlays its own buttons on the approve step (clickjacking a signature is a real attack).
 *  - `form-action 'self'` stops an injected form posting somewhere else.
 *  - `base-uri 'none'` stops an injected `<base>` repointing every relative URL in the page.
 *  - `object-src 'none'` removes the plugin surface entirely.
 *  - `strict-origin-when-cross-origin` keeps a wallet address out of the Referer sent off-site.
 *  - `Permissions-Policy` turns off hardware this product never uses.
 *
 * `script-src` has to allow `'unsafe-inline'` and `'unsafe-eval'`: Next's hydration bootstrap is
 * an inline script, and the wallet SDK evaluates at runtime. A nonce-based policy is the right
 * end state and is noted as such rather than claimed.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // The wallet SDK, the sign-in provider's JWKS, the Monad RPC and the indexer are all reached
  // from the browser. `https:` here is deliberate and bounded by the rest of the policy.
  process.env.NODE_ENV === "production"
    ? "connect-src 'self' https: wss:"
    : "connect-src 'self' https: wss: http://127.0.0.1:* http://localhost:* ws:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(process.env.NODE_ENV === "production"
    ? ["upgrade-insecure-requests"]
    : []),
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

// Local Anvil signing does not use the cloud SDK. Avoid compiling its large unused graph.
// These aliases are refused in production and do not create sessions or fake signatures.
const localWalletSdk =
  process.env.NODE_ENV !== "production" &&
  process.env.MODALIS_LOCAL_DEVELOPMENT === "true";
const localAliases = localWalletSdk
  ? {
      "@dynamic-labs/sdk-react-core": resolve(
        process.cwd(),
        "lib/local-wallet-sdk.ts",
      ),
      "@dynamic-labs/ethereum": resolve(
        process.cwd(),
        "lib/local-wallet-sdk.ts",
      ),
    }
  : {};

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: localWalletSdk
      ? {
          "@dynamic-labs/sdk-react-core": "@modalis/web/local-wallet-sdk",
          "@dynamic-labs/ethereum": "@modalis/web/local-wallet-sdk",
        }
      : {},
  },
  webpack(config, { dev }) {
    if (dev && localWalletSdk)
      Object.assign(config.resolve.alias, localAliases);
    return config;
  },
  // The workspace packages ship TypeScript source rather than build output, so Next compiles them
  // as part of the app. That keeps one source of truth for the contract ABIs and the portfolio
  // engine instead of a separate build step that could go stale.
  transpilePackages: [
    "@modalis/ai",
    "@modalis/auth",
    "@modalis/chain",
    "@modalis/db",
    "@modalis/domain",
    "@modalis/execution",
    "@modalis/portfolio",
    "@modalis/risk-monitor",
  ],
  experimental: {
    // Drop inactive dev compiler graphs after snapshots, especially on memory-limited WSL.
    ...(process.env.NODE_ENV !== "production"
      ? {
          turbopackMemoryEviction: "full" as const,
          webpackMemoryOptimizations: true,
        }
      : {}),
    optimizePackageImports: [
      "viem",
      "viem/chains",
      "@modalis/chain",
      "@modalis/domain/client",
      "@modalis/ai",
    ],
  },
  typedRoutes: false,
  allowedDevOrigins: ["127.0.0.1"],
  // The Dynamic server-wallet SDK (the agent's signer, packages/chain/src/agent.ts) is Node-only
  // and loads native binaries at runtime, so it is required from node_modules rather than bundled.
  serverExternalPackages: ["@dynamic-labs-wallet/node-evm"],

  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // A personal balance must never be cached by a CDN or a shared proxy.
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, private",
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
