import { test } from "node:test";
import assert from "node:assert/strict";
import { exposureOf } from "../src/exposure.ts";
import { assetMeta } from "../src/assets.ts";
import { displayName } from "../src/translate.ts";
import { money, type MoneyView } from "../src/models.ts";

const view: MoneyView = {
  total: money("10000"), available: money("4000"), invested: money("6000"), isEmpty: false, asOf: "",
  holdings: [
    { id: "a", name: "Cash", code: "mUSD", value: money("4000"), sharePercent: 40, targetPercent: 40, offTargetByPercent: 0, isAvailableCash: true, units: "0" },
    { id: "b", name: "Bitcoin", code: "mBTC", value: money("3500"), sharePercent: 35, targetPercent: 35, offTargetByPercent: 0, isAvailableCash: false, units: "0" },
    { id: "c", name: "Ethereum", code: "mETH", value: money("2500"), sharePercent: 25, targetPercent: 25, offTargetByPercent: 0, isAvailableCash: false, units: "0" },
  ],
};

test("crypto exposure is the sum of every crypto holding", () => {
  const e = exposureOf(view, "Kuru");
  assert.deepEqual(e.byKind.map((l) => [l.label, l.percent]), [["Crypto", 60], ["Cash", 40]]);
  assert.equal(e.byRisk.find((l) => l.label === "Crypto price swings")!.percent, 60);
});

test("cash is never attributed to a trading venue", () => {
  const e = exposureOf(view, "Kuru");
  assert.deepEqual(e.byVenue.map((l) => [l.label, l.percent]), [["Kuru", 60], ["None — held as cash", 40]]);
});

test("demo tokens are described as demo tokens, never as the real assets", () => {
  for (const s of ["mUSD", "mBTC", "mETH", "mBOND"]) {
    assert.match(assetMeta(s).issuer, /demo token/i);
    assert.equal(assetMeta(s).demo, true);
  }
});

test("an unregistered asset gets no invented description", () => {
  assert.equal(displayName("XYZ"), "XYZ");
  assert.match(assetMeta("XYZ").riskFactors[0], /Unknown/);
});
