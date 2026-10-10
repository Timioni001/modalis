import { test } from "node:test";
import assert from "node:assert/strict";
import { aiConfigFromEnv, interpretGoal, isAiConfigured, writeExplanation } from "../src/llm.ts";

function fakeFetch(content: string, seen: { url?: string; body?: any; auth?: string } = {}) {
  return (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.body = JSON.parse(String(init.body));
    seen.auth = (init.headers as Record<string, string>).authorization;
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as unknown as typeof fetch;
}

test("AI_BASE_URL switches to an OpenAI-compatible endpoint with no default model", () => {
  const cfg = aiConfigFromEnv({ AI_API_KEY: "k", AI_BASE_URL: "https://api.moonshot.ai/v1" });
  assert.equal(cfg.baseUrl, "https://api.moonshot.ai/v1");
  assert.equal(cfg.model, undefined);
  assert.equal(isAiConfigured(cfg), false, "another provider needs AI_MODEL");
  assert.equal(isAiConfigured({ ...cfg, model: "kimi-k2" }), true);
});

test("goals are read through chat completions in JSON mode and checked against the schema", async () => {
  const seen: { url?: string; body?: any; auth?: string } = {};
  const reply = JSON.stringify({
    goal_type: "house",
    target_value_usd: 50000,
    horizon_months: 60,
    confidence: "high",
    restatement: "You want $50,000 for a house in five years.",
  });
  const result = await interpretGoal("a house in 5 years, 50k", {
    apiKey: "k",
    model: "qwen-plus",
    baseUrl: "https://example.test/v1/",
    fetch: fakeFetch("```json\n" + reply + "\n```", seen),
  });
  assert.equal(seen.url, "https://example.test/v1/chat/completions");
  assert.equal(seen.auth, "Bearer k");
  assert.equal(seen.body.model, "qwen-plus");
  assert.deepEqual(seen.body.response_format, { type: "json_object" });
  assert.equal(result?.goal.targetValue, 50000);
  assert.equal(result?.goal.source, "llm");
});

test("an out-of-schema answer falls back", async () => {
  const result = await interpretGoal("x", {
    apiKey: "k",
    model: "m",
    baseUrl: "https://example.test/v1",
    fetch: fakeFetch(JSON.stringify({ goal_type: "yacht", target_value_usd: -1 })),
  });
  assert.equal(result, null);
});

test("explanations use the provider's text, or the fallback on failure", async () => {
  const facts = { event: "e", facts: ["a"], fallback: "fallback" };
  const ok = await writeExplanation(facts, { apiKey: "k", model: "m", baseUrl: "https://x/v1", fetch: fakeFetch("Your plan moved.") });
  assert.deepEqual(ok, { body: "Your plan moved.", model: "m" });
  const failing = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
  const bad = await writeExplanation(facts, { apiKey: "k", model: "m", baseUrl: "https://x/v1", fetch: failing });
  assert.deepEqual(bad, { body: "fallback", model: null });
});
