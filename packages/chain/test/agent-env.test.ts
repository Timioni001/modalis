import { test } from "node:test";
import assert from "node:assert/strict";
import { agentConfigFromEnv, agentIdentity, agentLabel, decodeAgentWallet, encodeAgentWallet } from "../src/agent-env.ts";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const KEY_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const WALLET = {
  walletMetadata: { walletId: "w1", accountAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", chainName: "EVM" },
  externalServerKeyShares: [{ share: "abc" }],
};

test("no agent configured", () => {
  assert.equal(agentConfigFromEnv({}), null);
  assert.equal(agentIdentity({}), null);
});

test("falls back to the manager key", () => {
  assert.deepEqual(agentIdentity({ MANAGER_PRIVATE_KEY: KEY }), { address: KEY_ADDRESS, kind: "key" });
});

test("a Dynamic server wallet wins over the key", () => {
  const env = {
    MANAGER_PRIVATE_KEY: KEY,
    DYNAMIC_API_TOKEN: "dyn_x",
    NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: "env",
    DYNAMIC_AGENT_WALLET: encodeAgentWallet(WALLET),
  };
  const cfg = agentConfigFromEnv(env);
  assert.equal(cfg?.kind, "dynamic");
  assert.equal(cfg?.address, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  assert.equal(agentLabel("dynamic"), "Dynamic server wallet");
});

test("the Dynamic wallet needs its token, not just the wallet", () => {
  assert.equal(agentIdentity({ DYNAMIC_AGENT_WALLET: encodeAgentWallet(WALLET) }), null);
});

test("wallet settings round-trip, and raw JSON is accepted", () => {
  assert.deepEqual(decodeAgentWallet(encodeAgentWallet(WALLET)), WALLET);
  assert.deepEqual(decodeAgentWallet(JSON.stringify(WALLET)), WALLET);
  assert.throws(() => decodeAgentWallet(JSON.stringify({ nope: 1 })));
});

test("a malformed setting reads as no agent rather than crashing the status page", () => {
  assert.equal(
    agentIdentity({ DYNAMIC_API_TOKEN: "t", NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: "e", DYNAMIC_AGENT_WALLET: "not-json" }),
    null,
  );
});
