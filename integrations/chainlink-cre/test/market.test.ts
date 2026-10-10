import { test } from "node:test";
import assert from "node:assert/strict";
import { combineWithMarket, marketStressBps } from "../src/market.ts";

const reply = {
  bitcoin: { usd: 64000, usd_24h_change: -3.214 },
  ethereum: { usd: 3100, usd_24h_change: 9.05 },
};

test("stress is the largest absolute 24h move, in bps", () => {
  assert.equal(marketStressBps(reply, ["bitcoin", "ethereum"]), 905);
  assert.equal(marketStressBps(reply, ["bitcoin"]), 321);
});

test("a feed with none of the ids fails loudly instead of reading as calm", () => {
  assert.throws(() => marketStressBps({}, ["bitcoin"]));
  assert.throws(() => marketStressBps(null, ["bitcoin"]));
});

test("stress raises OK to DRIFT, and never lowers or invents a breach", () => {
  assert.deepEqual(combineWithMarket({ status: 0, reason: "DRIFT:20/500" }, 905, 800), {
    status: 1,
    reason: "MARKET:905/800,DRIFT:20/500",
  });
  assert.equal(combineWithMarket({ status: 0, reason: "x" }, 100, 800).status, 0);
  assert.equal(combineWithMarket({ status: 2, reason: "x" }, 0, 800).status, 2);
  assert.equal(combineWithMarket({ status: 1, reason: "x" }, 2000, 800).status, 1);
  assert.deepEqual(combineWithMarket({ status: 0, reason: "x" }, null, 800), { status: 0, reason: "x" });
});
