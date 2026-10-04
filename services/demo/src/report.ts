/**
 * Report writer for the end-to-end run.
 *
 * Every transaction hash printed here came back from a node. Nothing in this file constructs,
 * formats or placeholders a hash — if a step did not send a transaction, it has no hash.
 */
import { addressUrl, chainById, txUrl } from "@modalis/chain";
import type { Hex } from "viem";

export type StepResult = {
  step: number;
  title: string;
  status: "ok" | "rejected_as_expected" | "failed";
  detail: string;
  /** Real transaction hashes produced by this step, if any. */
  txs?: { label: string; hash: Hex; blockNumber?: bigint; reverted?: boolean }[];
  facts?: string[];
};

export class Report {
  readonly steps: StepResult[] = [];
  // Plain fields rather than constructor parameter properties: Node's type-stripping runtime
  // does not support the latter.
  private readonly chainId: number;
  private readonly explorerBase?: string;

  constructor(chainId: number, explorerBase?: string) {
    this.chainId = chainId;
    this.explorerBase = explorerBase;
  }

  add(result: StepResult): StepResult {
    this.steps.push(result);
    const icon = result.status === "ok" ? "PASS" : result.status === "rejected_as_expected" ? "REJECTED (expected)" : "FAIL";
    console.log(`\n[${result.step}] ${result.title}  —  ${icon}`);
    console.log(`    ${result.detail}`);
    for (const f of result.facts ?? []) console.log(`    · ${f}`);
    for (const t of result.txs ?? []) {
      const chain = chainById(this.chainId);
      const url = txUrl(chain, t.hash, this.explorerBase);
      const state = t.reverted ? "reverted on-chain" : "confirmed";
      console.log(`    tx ${t.label}: ${t.hash} (${state}${t.blockNumber !== undefined ? `, block ${t.blockNumber}` : ""})`);
      if (url) console.log(`       ${url}`);
    }
    return result;
  }

  get failed(): boolean {
    return this.steps.some((s) => s.status === "failed");
  }

  summary(): string {
    const lines: string[] = [];
    lines.push("");
    lines.push("=".repeat(78));
    lines.push("MODALIS — end-to-end loop");
    lines.push("=".repeat(78));
    for (const s of this.steps) {
      const mark = s.status === "failed" ? "FAIL" : s.status === "rejected_as_expected" ? "REJECTED" : "ok";
      lines.push(`  ${String(s.step).padStart(2)}. ${s.title.padEnd(52)} ${mark}`);
    }
    const txCount = this.steps.flatMap((s) => s.txs ?? []).length;
    lines.push("-".repeat(78));
    lines.push(`  ${txCount} real transactions on chain ${this.chainId}`);
    lines.push(this.failed ? "  RESULT: FAILED" : "  RESULT: the full loop works");
    lines.push("=".repeat(78));
    return lines.join("\n");
  }

  /** Markdown the README/demo doc can embed, with real hashes only. */
  markdown(): string {
    const chain = chainById(this.chainId);
    const lines: string[] = [`# Modalis end-to-end run (chain ${this.chainId})`, ""];
    for (const s of this.steps) {
      const mark = s.status === "failed" ? "FAILED" : s.status === "rejected_as_expected" ? "rejected by the contract, as intended" : "ok";
      lines.push(`## ${s.step}. ${s.title} — ${mark}`, "", s.detail, "");
      for (const f of s.facts ?? []) lines.push(`- ${f}`);
      if (s.facts?.length) lines.push("");
      for (const t of s.txs ?? []) {
        const url = txUrl(chain, t.hash, this.explorerBase);
        const label = `\`${t.hash}\`${t.reverted ? " (reverted on-chain)" : ""}`;
        lines.push(`- ${t.label}: ${url ? `[${label}](${url})` : label}`);
      }
      if (s.txs?.length) lines.push("");
    }
    return lines.join("\n");
  }

  addressLink(address: string): string {
    return addressUrl(chainById(this.chainId), address, this.explorerBase) ?? address;
  }
}
