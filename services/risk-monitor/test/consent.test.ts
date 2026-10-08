import { test } from "node:test";
import assert from "node:assert/strict";
import { consentFor, recordFinding } from "../src/consent.ts";

const OWNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

test("with no saved data, the monitor never acts on its own, even with the operator switch on", async () => {
  const d = await consentFor(null, OWNER, { operatorEnabled: true, simulationOk: true });
  assert.equal(d.run, false);
});

test("with no saved data, nothing is recorded and nothing throws", async () => {
  assert.equal(await recordFinding(null, OWNER, "adjustment_proposed", "x"), false);
});
