/**
 * What a domain service needs to do its job.
 *
 * Assembled once per request by the API layer. Services receive this rather than reaching for
 * environment variables, so they stay testable and so there is one place that decides which
 * chain, which database and which explorer are in play.
 */
import type { Deployment } from "@modalis/chain";
import type { ModalisClient } from "@modalis/db";
import type { Address, PublicClient } from "viem";

export type DomainContext = {
  client: PublicClient;
  deployment: Deployment;
  /** Null when no database is configured. Services degrade rather than fail. */
  db: ModalisClient | null;
  explorerUrl?: string;
  rpcUrl?: string;
  ai?: { apiKey?: string; model?: string; baseUrl?: string };
  /** The address allowed to propose adjustments, when one is configured. */
  managerAddress?: Address;
  /** The hosted Envio indexer's GraphQL endpoint. When set, history is read from it first. */
  envioUrl?: string;
};

/** A domain-level failure with a message a person can read. */
export class DomainError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
  }
}
