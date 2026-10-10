import { test } from "node:test";
import assert from "node:assert/strict";
import { envioStatsQuery, parseEnvioStats } from "../lib/envio-stats.ts";

test("counts plans, this week's transactions and adjustments from the indexer", () => {
  const stats = parseEnvioStats({
    data: {
      plans: [{ id: "a" }, { id: "b" }],
      week: [{ type: "DEPOSIT" }, { type: "REBALANCE" }, { type: "REBALANCE" }],
      recent: [{ txHash: "0xabc", type: "REBALANCE", timestamp: "1760000000" }],
    },
  });
  assert.deepEqual(stats, {
    plans: 2,
    transactionsThisWeek: 3,
    adjustmentsThisWeek: 2,
    recent: [{ hash: "0xabc", type: "rebalance", at: new Date(1760000000 * 1000).toISOString() }],
  });
});

test("an error or a missing field falls back", () => {
  assert.equal(parseEnvioStats({ errors: [{ message: "x" }] }), null);
  assert.equal(parseEnvioStats({ data: { plans: [] } }), null);
  assert.equal(parseEnvioStats(null), null);
});

test("the week filter uses whole seconds", () => {
  assert.match(envioStatsQuery(1760000000.7), /_gte: "1760000000"/);
});
