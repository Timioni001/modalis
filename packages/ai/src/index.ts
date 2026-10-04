/**
 * @modalis/ai — the intelligence layer.
 *
 * AI decides what should happen. Smart contracts decide what is allowed.
 *
 * Everything that reaches the chain is produced by the deterministic modules here
 * (profile -> allocation -> mandate). The LLM reads free text and writes prose, and the whole
 * pipeline runs correctly with no AI provider configured.
 */
export * from "./types.ts";
export * from "./profile.ts";
export * from "./allocation.ts";
export * from "./mandate.ts";
export * from "./explain.ts";
export * from "./llm.ts";
