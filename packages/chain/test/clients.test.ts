/**
 * Which node a client talks to.
 *
 * This exists because of a real bug. `httpUrlsFor` used to append the chain's PUBLIC endpoint
 * after whatever was configured, so a client pointed at a local node held two endpoints. Gas
 * estimation then answered from public Monad testnet — where the local addresses hold no code —
 * and every transaction was signed with a plain-transfer gas limit and ran out of gas on the node
 * that actually had the contracts. Only the end-to-end run caught it, because every unit test
 * either used one endpoint or no node at all.
 *
 * The rule now: a CONFIGURED endpoint is used exclusively, and a write client talks to exactly
 * one node. The public endpoint is a default for when nothing is configured, never a companion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountFromPrivateKey,
  createManagerWalletClient,
  createMonadPublicClient,
  createMonadWebSocketClient,
  rpcConfigFromEnv,
} from "../src/clients.ts";
import { chainById } from "../src/chains.ts";

const LOCAL = "http://127.0.0.1:8545";
// A well-known anvil test key. It holds nothing on any real network.
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const PUBLIC_TESTNET = chainById(10143).rpcUrls.default.http;

test("a configured endpoint is the only one a read client uses", () => {
  const client = createMonadPublicClient({ chainId: 10143, httpUrl: LOCAL, multicall: false });
  // One configured endpoint means one transport, not a fallback that could answer from elsewhere.
  assert.equal(client.transport.type, "http");
  assert.equal(client.transport.url, LOCAL);
});

test("a configured endpoint is the only one a write client uses", () => {
  const wallet = createManagerWalletClient({ chainId: 10143, httpUrl: LOCAL }, TEST_KEY);
  assert.equal(wallet.transport.type, "http");
  assert.equal(wallet.transport.url, LOCAL);

  // The public endpoint must not be reachable through this client at all: estimating a gas limit
  // or a nonce against a different chain is how a transaction ends up broken or broadcast wrongly.
  assert.ok(
    !PUBLIC_TESTNET.includes(String(wallet.transport.url)),
    "a write client pointed at one node must never hold another",
  );
});

test("a write client talks to one node even when several are configured", () => {
  const wallet = createManagerWalletClient(
    { chainId: 10143, httpUrl: LOCAL, alchemyApiKey: "key-under-test" },
    TEST_KEY,
  );
  assert.equal(wallet.transport.type, "http", "never a fallback: it signs and broadcasts");
  assert.equal(wallet.transport.url, LOCAL, "the explicitly configured endpoint wins");
});

test("several configured endpoints give a read client something to fall back to", () => {
  const client = createMonadPublicClient({
    chainId: 10143,
    httpUrl: LOCAL,
    alchemyApiKey: "key-under-test",
    multicall: false,
  });
  assert.equal(client.transport.type, "fallback");
  // Still only the configured ones: a degraded provider is a reason to try the other provider,
  // not a reason to start reading a different node.
  const urls = (client.transport.transports as { value: { url: string } }[]).map((t) => t.value.url);
  assert.equal(urls.length, 2);
  assert.equal(urls[0], LOCAL);
  assert.ok(urls[1].includes("alchemy"));
  for (const url of urls) {
    assert.ok(!PUBLIC_TESTNET.includes(url), "a configured client must not reach for the public node");
  }
});

test("with nothing configured, the chain's public endpoint is the default", () => {
  const client = createMonadPublicClient({ chainId: 10143, multicall: false });
  const url = String(client.transport.url ?? "");
  assert.ok(PUBLIC_TESTNET.includes(url), `expected a public endpoint, got ${url}`);
});

test("mainnet and testnet resolve to their own chains, and nothing else does", () => {
  assert.equal(chainById(143).id, 143);
  assert.equal(chainById(10143).id, 10143);
  assert.throws(() => chainById(1), /chain|support/i);
});

test("batched reads are off when asked, because a bare node has no Multicall3", () => {
  // Batching against a missing Multicall3 returns empty data rather than an error, which looks
  // exactly like an empty portfolio. So it has to be switchable.
  const batched = createMonadPublicClient({ chainId: 10143, httpUrl: LOCAL });
  const unbatched = createMonadPublicClient({ chainId: 10143, httpUrl: LOCAL, multicall: false });
  assert.ok(batched.batch?.multicall, "batching is the default, which is right for Monad");
  assert.equal(unbatched.batch?.multicall, undefined);
});

test("no WebSocket endpoint means no event-stream client, rather than a broken one", () => {
  assert.equal(createMonadWebSocketClient({ chainId: 10143 }), null);
  const ws = createMonadWebSocketClient({ chainId: 10143, wsUrl: "ws://127.0.0.1:8545" });
  assert.ok(ws, "a configured WebSocket endpoint gives a client");
});

test("a private key must be a key, not a passphrase or a truncated paste", () => {
  assert.equal(
    accountFromPrivateKey(TEST_KEY).address,
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  );
  // Accepted without the 0x, since that is how keys are often pasted.
  assert.equal(
    accountFromPrivateKey(TEST_KEY.slice(2)).address,
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  );
  for (const bad of ["", "0x", "hunter2", TEST_KEY.slice(0, 40), `${TEST_KEY}ff`]) {
    assert.throws(() => accountFromPrivateKey(bad), /32 bytes of hex/, `"${bad}" should be refused`);
  }
});

test("RPC settings are read from the documented variables", () => {
  const testnet = rpcConfigFromEnv({ NEXT_PUBLIC_MONAD_RPC_URL: LOCAL });
  assert.equal(testnet.chainId, 10143, "testnet is the default, so nothing defaults to real money");
  assert.equal(testnet.httpUrl, LOCAL);

  const mainnet = rpcConfigFromEnv({
    MODALIS_NETWORK: "mainnet",
    MONAD_MAINNET_RPC_URL: "https://example.test/mainnet",
  });
  assert.equal(mainnet.chainId, 143);
  assert.equal(mainnet.httpUrl, "https://example.test/mainnet");

  // An explicit chain id wins, so a deployment cannot be pointed at one chain and configured for
  // another without saying so.
  const explicit = rpcConfigFromEnv({ NEXT_PUBLIC_MONAD_CHAIN_ID: "143" });
  assert.equal(explicit.chainId, 143);
});
