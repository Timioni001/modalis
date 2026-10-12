/**
 * Test money. The amounts must be in each token's own decimals (a 6-decimal token minted with
 * 1e18 units hands out a trillion dollars), and nothing here may run on mainnet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, type Address, type WalletClient } from "viem";
import {
  TEST_MONEY_UNITS,
  hasLowGas,
  isOutOfGasFundsError,
  isTestnetFaucetChain,
  mintTestMoney,
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
  await assert.rejects(mintTestMoney(wallet, { ...deployment, chainId: 143 }), /test network/);
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
