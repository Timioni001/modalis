/**
 * The structured LLM layer.
 *
 * The model is given exactly two jobs, both of which are safe to get wrong:
 *
 *   1. interpretGoal()      — read a free-text goal into structured fields.
 *   2. writeExplanation()   — turn a set of facts we computed into readable prose.
 *
 * It is never asked to choose an allocation, size a trade, set a mandate parameter, or produce
 * anything resembling a contract call. Those come from the deterministic modules, because an
 * invalid allocation is a failed transaction and a wrong one is someone's savings.
 *
 * Both functions degrade rather than fail: with no API key, an API error, or a response that does
 * not match the schema, they return null and the caller uses its deterministic fallback. The
 * product therefore works end to end with no AI provider configured at all.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { GoalType, ParsedGoal } from "./types.ts";

/**
 * Default model. Deliberately a capable model: this layer runs a handful of times per user
 * journey, not per block, so quality matters more than per-token cost here.
 */
export const DEFAULT_AI_MODEL = "claude-opus-5-5";

const GOAL_TYPES = [
  "house",
  "education",
  "long_term_wealth",
  "emergency_reserve",
  "retirement",
  "major_purchase",
  "travel",
  "custom",
] as const;

/** Schema the model must satisfy. Anything outside these bounds is rejected, not clamped. */
const ParsedGoalSchema = z.object({
  goal_type: z.enum(GOAL_TYPES),
  target_value_usd: z.number().positive().max(100_000_000),
  horizon_months: z.number().int().min(1).max(720),
  confidence: z.enum(["high", "medium", "low"]),
  /** The model's own restatement, shown back to the user for confirmation. */
  restatement: z.string().min(1).max(300),
});

export type AiConfig = {
  apiKey?: string;
  model?: string;
  /** Injectable for tests. Defaults to a client built from apiKey. */
  client?: Anthropic;
};

export function aiConfigFromEnv(env: Record<string, string | undefined> = process.env): AiConfig {
  return { apiKey: env.AI_API_KEY, model: env.AI_MODEL || DEFAULT_AI_MODEL };
}

export function isAiConfigured(cfg: AiConfig): boolean {
  return Boolean(cfg.client ?? cfg.apiKey);
}

function clientFor(cfg: AiConfig): Anthropic | null {
  if (cfg.client) return cfg.client;
  if (!cfg.apiKey) return null;
  return new Anthropic({ apiKey: cfg.apiKey });
}

const GOAL_SYSTEM = `You read a person's description of a savings goal and extract structured fields.

Rules:
- Only extract what the person actually said or clearly implied. Never invent a number.
- target_value_usd is the amount of money they need, in US dollars.
- horizon_months is how long until they need it, in whole months.
- If the amount or the timeframe is genuinely absent, set confidence to "low" and use your best
  reading; the caller will fall back to asking them directly.
- restatement is one plain sentence, addressed to the person, confirming what you understood.
  No financial advice, no projections, no promises about returns.`;

export type InterpretGoalResult = {
  goal: ParsedGoal;
  confidence: "high" | "medium" | "low";
  restatement: string;
};

/**
 * Parses a free-text goal. Returns null when AI is unconfigured or the output fails the schema,
 * which the caller treats as "use the form fields the user filled in".
 */
export async function interpretGoal(
  text: string,
  cfg: AiConfig = aiConfigFromEnv(),
): Promise<InterpretGoalResult | null> {
  const client = clientFor(cfg);
  if (!client || !text.trim()) return null;

  try {
    const response = await client.messages.parse({
      model: cfg.model ?? DEFAULT_AI_MODEL,
      max_tokens: 4096,
      // A short extraction; low effort keeps it quick and cheap without hurting accuracy.
      output_config: { effort: "low", format: zodOutputFormat(ParsedGoalSchema) },
      system: GOAL_SYSTEM,
      messages: [{ role: "user", content: text }],
    });

    // A refusal or a parse failure both mean "we have no usable structured output".
    if (response.stop_reason === "refusal") return null;
    const parsed = response.parsed_output;
    if (!parsed) return null;

    return {
      goal: {
        goalType: parsed.goal_type as GoalType,
        targetValue: parsed.target_value_usd,
        horizonMonths: parsed.horizon_months,
        source: "llm",
      },
      confidence: parsed.confidence,
      restatement: parsed.restatement,
    };
  } catch (err) {
    if (err instanceof Anthropic.APIError) return null;
    // A schema mismatch from the helper is also a non-event: fall back.
    return null;
  }
}

/**
 * Facts the explanation must be built from. The model is given these and nothing else, so it
 * cannot introduce a number the system did not compute.
 */
export type ExplanationFacts = {
  /** What happened, e.g. "mandate_breach", "rebalance_executed", "mandate_created". */
  event: string;
  /** Short factual statements, already formatted. */
  facts: string[];
  /** The deterministic explanation. Returned verbatim if the model is unavailable. */
  fallback: string;
};

const EXPLANATION_SYSTEM = `You write one short paragraph explaining a portfolio action to the
person whose money it is.

Hard rules:
- Use ONLY the facts provided. Never add a number, percentage, asset, date or cause that is not in
  the list. If the facts do not explain something, leave it unexplained.
- No predictions, no projected returns, no reassurance about future performance, no advice.
- Never say the system detected an "opportunity" or made a "smart" or "optimal" move. The action
  happened because a rule the person approved required it.
- Plain language. No jargon: no "AMM", "liquidity pool", "basis points", "alpha", "drawdown".
  Say "limit", "target", "cash", "fell", "grew".
- Address the person as "you" and "your portfolio". Two to four sentences.`;

/**
 * Turns computed facts into prose. Falls back to the deterministic sentence on any failure, so
 * the user always gets an explanation.
 */
export async function writeExplanation(
  facts: ExplanationFacts,
  cfg: AiConfig = aiConfigFromEnv(),
): Promise<{ body: string; model: string | null }> {
  const client = clientFor(cfg);
  if (!client) return { body: facts.fallback, model: null };

  const model = cfg.model ?? DEFAULT_AI_MODEL;
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      output_config: { effort: "low" },
      system: EXPLANATION_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Event: ${facts.event}\n\nFacts:\n${facts.facts.map((f) => `- ${f}`).join("\n")}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") return { body: facts.fallback, model: null };

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return text ? { body: text, model } : { body: facts.fallback, model: null };
  } catch {
    return { body: facts.fallback, model: null };
  }
}
