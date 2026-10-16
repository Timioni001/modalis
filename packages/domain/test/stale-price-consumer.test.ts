import { test } from "node:test";
import assert from "node:assert/strict";
import { readAssetBalances } from "@modalis/chain";
import { getScenarios } from "../src/services/goal.ts";
import { getGoals } from "../src/services/goals.ts";
import {
  prepareDirectSaving,
  prepareDirectRetrieval,
} from "../src/services/direct-saving.ts";
import {
  fakeContext,
  onPlan,
  OWNER,
  TOKENS,
  type FakeChainSpec,
} from "./fake-chain.ts";
function unavailable(spec: FakeChainSpec = onPlan()) {
  const ctx = fakeContext(spec);
  const read = ctx.client.readContract.bind(ctx.client);
  ctx.client.readContract = (async (args: any) => {
    if (args.functionName === "value" || args.functionName === "convert")
      throw new Error("expired quote");
    return read(args);
  }) as typeof ctx.client.readContract;
  return { ...ctx, deployment: { ...ctx.deployment, chainId: 10143 } };
}
test("manual scenarios use only the entered amount and label it, while live valuation stays blocked", async () => {
  const ctx = unavailable();
  const out = await getScenarios(ctx, OWNER, undefined, new Date(), "123.45");
  assert.equal(out.source, "manual");
  assert.match(out.assumption, /not a live balance/);
  const answered = await getScenarios(
    ctx,
    OWNER,
    { kind: "add_lump_sum", question: "", amount: 100 },
    new Date(),
    "123.45",
  );
  assert.ok(answered.result);
  await assert.rejects(getScenarios(ctx, OWNER));
});
test("goals retain their approved target without inventing a zero portfolio value", async () => {
  const view = await getGoals(unavailable(), OWNER);
  assert.equal(view.valuationAvailable, false);
  assert.equal(view.total, null);
  assert.equal(view.surplus, null);
  assert.equal(view.definitions?.[0].target.amount, "20000");
});
test("asset quantities can be read exactly with all price reads failing", async () => {
  const ctx = unavailable();
  const balances = await readAssetBalances(ctx.client, ctx.deployment, OWNER);
  assert.ok(balances.hasMandate);
  assert.equal(
    balances.holdings.find((holding) => holding.symbol === "mUSD")?.units,
    "4000",
  );
  assert.ok(!JSON.stringify(balances).includes("valueE18"));
});
test("direct saving uses six-decimal units, allowance and wallet balance without quotes", async () => {
  const prepared = await prepareDirectSaving(unavailable(), OWNER, "12.34");
  assert.equal(prepared.rawUnits, "12340000");
  assert.equal(prepared.needsApproval, true);
  assert.equal(prepared.canCover, true);
  await assert.rejects(prepareDirectSaving(unavailable(), OWNER, "0"));
  await assert.rejects(prepareDirectSaving(unavailable(), OWNER, "1.001"));
  await assert.rejects(
    prepareDirectSaving(fakeContext(onPlan()), OWNER, "1"),
    /demo test network/,
  );
  const spec = onPlan();
  spec.allocations = spec.allocations!.filter((a) => a.token !== TOKENS.mUSD);
  await assert.rejects(
    prepareDirectSaving(unavailable(spec), OWNER, "1"),
    /not included/,
  );
});
test("retrieval remains possible when the savings asset is disabled, but never exceeds saved units", async () => {
  const spec = onPlan();
  spec.assets = spec.assets!.map((a) => ({
    ...a,
    enabled: a.symbol !== "mUSD",
  }));
  const ctx = unavailable(spec);
  assert.equal(
    (await prepareDirectRetrieval(ctx, OWNER, "2.50")).rawUnits,
    "2500000",
  );
  await assert.rejects(
    prepareDirectSaving(ctx, OWNER, "2.50"),
    /not configured correctly/,
  );
  await assert.rejects(
    prepareDirectRetrieval(ctx, OWNER, "4000.01"),
    /don't have/,
  );
});
