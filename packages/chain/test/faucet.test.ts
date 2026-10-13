/**
 * Test money. The amounts must be in each token's own decimals (a 6-decimal token minted with
 * 1e18 units hands out a trillion dollars), and nothing here may run on mainnet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, type Address, type PublicClient, type WalletClient } from "viem";
import {
  TEST_MONEY_UNITS,
  hasLowGas,
  isOutOfGasFundsError,
  isTestnetFaucetChain,
  mintTestMoney,
  mintTestMoneyTo,
  MULTICALL3_ADDRESS,
  testMoneyCalls,
} from "../src/faucet.ts";
import { MockERC20Abi } from "../src/abis/index.ts";
import type { Deployment } from "../src/addresses.ts";

const ME: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const deployment: Deployment = {
  chainId: 10143,
  contracts: {},
  tokens: {
    mUSD: "0x0000000000000000000000000000000000000001",
    mBTC: "0x0000000000000000000000000000000000000002",
    mETH: "0x0000000000000000000000000000000000000003",
    mBOND: "0x0000000000000000000000000000000000000000",
  },
};

test("each demo token is minted in its own decimals", () => {
  assert.equal(TEST_MONEY_UNITS.mUSD, 10_000_000_000n); // 10,000 at 6
  assert.equal(TEST_MONEY_UNITS.mBTC, 20_000_000n); // 0.2 at 8
  assert.equal(TEST_MONEY_UNITS.mETH, 4_000_000_000_000_000_000n); // 4 at 18
});

test("one call per deployed token, all minting to the caller, undeployed ones skipped", () => {
  const calls = testMoneyCalls(deployment, ME);
  assert.equal(calls.length, 3, "the zero-address mBOND is skipped");
  for (const call of calls) {
    const decoded = decodeFunctionData({ abi: MockERC20Abi, data: call.callData });
    assert.equal(decoded.functionName, "mint");
    assert.equal((decoded.args as [Address, bigint])[0], ME);
    assert.equal(call.allowFailure, false);
  }
});

test("never on mainnet", async () => {
  assert.equal(isTestnetFaucetChain(143), false);
  assert.equal(isTestnetFaucetChain(10143), true);
  const wallet = { account: { address: ME }, writeContract: async () => "0x" } as unknown as WalletClient;
  await assert.rejects(mintTestMoney(wallet, { ...deployment, chainId: 143 }, {} as PublicClient), /test network/);
});

test("low gas means essentially none", () => {
  assert.equal(hasLowGas(0n), true);
  assert.equal(hasLowGas(10n ** 17n), false);
});

test("recognises a wallet that can't pay the fee, however it is worded", () => {
  assert.equal(isOutOfGasFundsError(new Error("insufficient funds for gas * price + value")), true);
  const nested = Object.assign(new Error("Transaction failed"), {
    cause: Object.assign(new Error("x"), { name: "InsufficientFundsError" }),
  });
  assert.equal(isOutOfGasFundsError(nested), true);
  assert.equal(isOutOfGasFundsError(new Error("User rejected the request.")), false);
});


test("a bare local node mints into the wallet instead of calling an empty Multicall3 address", async () => {
  const targets: string[] = [];
  const confirmed: string[] = [];
  const wallet = { account: { address: ME }, writeContract: async (args: { address: string; args: unknown[] }) => {
    targets.push(args.address);
    assert.equal(args.args[0], ME);
    return `0x${targets.length.toString(16).padStart(64, "0")}`;
  } } as unknown as WalletClient;
  const client = { getCode: async () => "0x", waitForTransactionReceipt: async ({ hash }: { hash: string }) => {
    confirmed.push(hash); return { status: "success" };
  } } as unknown as PublicClient;
  const receipts = await mintTestMoneyTo(wallet, client, deployment, ME);
  assert.equal(receipts.length, 3);
  assert.equal(confirmed.length, 3);
  assert.ok(!targets.includes(MULTICALL3_ADDRESS));
  assert.equal(isTestnetFaucetChain(1), false, "Ethereum mainnet isn't a test network");
});

test("a reverted individual mint stops the remaining writes", async () => {
  let writes = 0;
  const wallet = { account: { address: ME }, writeContract: async () => { writes++; return "0x"; } } as unknown as WalletClient;
  const client = { getCode: async () => "0x", waitForTransactionReceipt: async () => ({ status: "reverted" }) } as unknown as PublicClient;
  await assert.rejects(() => mintTestMoneyTo(wallet, client, deployment, ME), /reverted/);
  assert.equal(writes, 1);
});
