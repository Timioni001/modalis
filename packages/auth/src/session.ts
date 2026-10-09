/**
 * Wallet-based authentication.
 *
 * The rule this file exists to enforce: **an address in a request body is not proof of identity.**
 * Before this existed, any caller could post `{"owner":"0x<someone else>"}` and make the Modalis
 * manager key act on that person's portfolio. The contract still protected their funds — nothing
 * could be stolen — but it allowed griefing and burned someone else's gas.
 *
 * Identity now comes from one place: a Dynamic-issued JWT, verified against Dynamic's published
 * signing keys (JWKS). The wallet address in that verified token is the only address the server
 * will act on behalf of.
 *
 * This does NOT replace the contract's enforcement. Authentication answers "who is asking?".
 * PortfolioMandate still answers "is this allowed?", and it is the final authority.
 */
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from "jose";
import { getAddress, isAddress } from "viem";

export type Session = {
  /** The verified wallet address. Checksummed. */
  walletAddress: `0x${string}`;
  /** Dynamic's own user id, when present. */
  userId?: string;
  email?: string;
  /** How this session was established. `dev` never appears in production. */
  via: "dynamic" | "dev";
  expiresAt?: Date;
};

export class AuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

export type AuthConfig = {
  jwksUrl?: string;
  /** Dynamic environment id, checked as the audience when provided. */
  environmentId?: string;
  /**
   * Development escape hatch. When true, a request may name its own wallet through the
   * x-modalis-dev-wallet header. Refused on mainnet, and surfaced loudly by the status endpoint,
   * so it can never be a silent hole.
   */
  allowDevAuth: boolean;
  chainId: number;
};

export function authConfigFromEnv(env: Record<string, string | undefined> = process.env): AuthConfig {
  const chainId = Number(env.NEXT_PUBLIC_MONAD_CHAIN_ID?.trim() || 10143);
  const devRequested = (env.MODALIS_DEV_AUTH ?? "false").toLowerCase() === "true";
  return {
    jwksUrl: env.DYNAMIC_JWKS_URL?.trim() || deriveJwksUrl(env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID),
    environmentId: env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID?.trim() || undefined,
    // Never on mainnet, whatever the environment says.
    allowDevAuth: devRequested && chainId !== 143,
    chainId,
  };
}

/** Dynamic publishes its keys at a predictable URL derived from the environment id. */
function deriveJwksUrl(environmentId?: string): string | undefined {
  const id = environmentId?.trim();
  if (!id) return undefined;
  return `https://app.dynamic.xyz/api/v0/sdk/${id}/.well-known/jwks`;
}

export function isAuthConfigured(cfg: AuthConfig = authConfigFromEnv()): boolean {
  return Boolean(cfg.jwksUrl);
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedJwksUrl: string | null = null;

function jwks(url: string) {
  if (!cachedJwks || cachedJwksUrl !== url) {
    // createRemoteJWKSet caches and rotates keys internally.
    cachedJwks = createRemoteJWKSet(new URL(url));
    cachedJwksUrl = url;
  }
  return cachedJwks;
}

/**
 * Pulls the wallet address out of a Dynamic token.
 *
 * Supports both shapes Dynamic emits: a flat `wallet_address` claim (what this project configures
 * for Supabase row-level security) and the `verified_credentials` array.
 */
export function walletFromClaims(payload: JWTPayload): `0x${string}` | null {
  const flat = payload["wallet_address"];
  if (typeof flat === "string" && isAddress(flat)) return getAddress(flat);

  const credentials = payload["verified_credentials"];
  if (Array.isArray(credentials)) {
    for (const credential of credentials) {
      const address = (credential as { address?: unknown })?.address;
      const format = (credential as { format?: unknown })?.format;
      // Only blockchain credentials carry an address; email credentials do not.
      if (typeof address === "string" && isAddress(address) && format !== "email") {
        return getAddress(address);
      }
    }
  }
  return null;
}

/** Verifies a Dynamic JWT and returns the session it proves. Throws AuthError otherwise. */
export async function verifyToken(token: string, cfg: AuthConfig = authConfigFromEnv()): Promise<Session> {
  if (!cfg.jwksUrl) {
    throw new AuthError(
      "auth_not_configured",
      "Sign-in is not configured on this server. Set DYNAMIC_JWKS_URL or NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID.",
      503,
    );
  }

  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, jwks(cfg.jwksUrl), {
      // Dynamic sets the environment id as the audience.
      ...(cfg.environmentId ? { audience: cfg.environmentId } : {}),
    });
    payload = verified.payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AuthError("invalid_token", `Your sign-in could not be verified: ${message}`);
  }

  const walletAddress = walletFromClaims(payload);
  if (!walletAddress) {
    throw new AuthError(
      "no_wallet_in_token",
      "That sign-in has no wallet attached, so there is no account to act on.",
    );
  }

  return {
    walletAddress,
    userId: typeof payload.sub === "string" ? payload.sub : undefined,
    email: typeof payload["email"] === "string" ? (payload["email"] as string) : undefined,
    via: "dynamic",
    expiresAt: payload.exp ? new Date(payload.exp * 1000) : undefined,
  };
}

/** Reads a bearer token from an Authorization header. */
export function bearerToken(headers: Headers): string | null {
  const raw = headers.get("authorization") ?? headers.get("Authorization");
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match ? match[1].trim() : null;
}

/**
 * The session for a request, or null when there is none.
 *
 * Never throws for a missing token — callers decide whether anonymous access is acceptable for
 * that route. Reads of public chain data are fine anonymously; anything that spends gas or moves
 * money is not.
 */
export async function readSession(
  request: { headers: Headers },
  cfg: AuthConfig = authConfigFromEnv(),
): Promise<Session | null> {
  const token = bearerToken(request.headers);
  if (token) return verifyToken(token, cfg);

  if (cfg.allowDevAuth) {
    const devWallet = request.headers.get("x-modalis-dev-wallet");
    if (devWallet && isAddress(devWallet)) {
      return { walletAddress: getAddress(devWallet), via: "dev" };
    }
  }
  return null;
}

/** The session for a request, or an AuthError. Use on every route that changes something. */
export async function requireSession(
  request: { headers: Headers },
  cfg: AuthConfig = authConfigFromEnv(),
): Promise<Session> {
  const session = await readSession(request, cfg);
  if (!session) {
    throw new AuthError("not_signed_in", "You need to be signed in to do that.");
  }
  return session;
}

/**
 * Confirms the signed-in person is the owner of what they are acting on.
 *
 * Modalis keys a portfolio to its owner address, so ownership is address equality — but it must
 * be checked against the VERIFIED address, never one supplied by the caller.
 */
export function assertOwns(session: Session, owner: string): `0x${string}` {
  if (!isAddress(owner)) {
    throw new AuthError("bad_address", "That is not a valid account address.", 400);
  }
  if (getAddress(owner) !== session.walletAddress) {
    throw new AuthError(
      "not_your_account",
      "That isn't your account. You can only act on your own plan and money.",
      403,
    );
  }
  return session.walletAddress;
}

/** Decodes without verifying. Diagnostics only — never for an access decision. */
export function peekToken(token: string): JWTPayload | null {
  try {
    return decodeJwt(token);
  } catch {
    return null;
  }
}
