/**
 * Test money and gas, for testnet only.
 *
 * A new person arriving on the testnet deployment holds nothing: no demo tokens to add, and no
 * MON to pay the network fee for anything at all. Both used to need a terminal command
 * (scripts/fund-wallet.sh). This module is what lets the app do it with a button instead.
 *
 * Two routes, depending on how the deployment is configured:
 *
 *  - **Modalis pays.** When the server holds FAUCET_PRIVATE_KEY, it mints the demo tokens and
 *    tops up a little MON itself, so a brand-new wallet needs nothing at all.
 *  - **The person pays.** Otherwise the person's own wallet mints the tokens, all four in ONE
 *    transaction through Multicall3. That needs a little MON, which is what the gas guidance is
 *    for.
 *
 * The demo tokens are open-mint on purpose (contracts/src/mocks/MockERC20.sol): they are props,
 * not assets. None of this exists on mainnet, and every entry point here refuses to run there.
 */
import { encodeFunctionData, parseAbi, type Address, type Hex, type WalletClient } from "viem";
import { MockERC20Abi } from "./abis/index.ts";
import { MONAD_MAINNET_ID } from "./chains.ts";
import type { Deployment, TokenKey } from "./addresses.ts";

/**
 * How much of each demo token one "Get test money" gives, in that token's own decimals.
 * Matches scripts/fund-wallet.sh: roughly $35,000 of demo value at the oracle's opening prices.
 */
export const TEST_MONEY_UNITS: Record<TokenKey, bigint> = {
  mUSD: 10_000n * 10n ** 6n, // 10,000 at 6 decimals
  mBTC: 2n * 10n ** 7n, // 0.2 at 8 decimals
  mETH: 4n * 10n ** 18n, // 4 at 18 decimals
  mBOND: 100n * 10n ** 18n, // 100 at 18 decimals
};

/**
 * Below this, a wallet is treated as unable to pay fees. A Monad testnet transaction costs a tiny
 * fraction of this, so it is a "you have essentially none" line, not a budget.
 */
export const LOW_GAS_WEI = 10n ** 16n; // 0.01 MON

/** What the server faucet tops a wallet up with, when it is below LOW_GAS_WEI. */
export const GAS_TOP_UP_WEI = 5n * 10n ** 16n; // 0.05 MON

/**
 * A wallet holding at least this much mUSD already has test money. The server faucet refuses to
 * give more, which is what bounds it without a shared rate limiter: the chain is the record.
 */
export const HAS_TEST_MONEY_UNITS = 1_000n * 10n ** 6n; // 1,000 mUSD

/** Monad's own testnet faucet, for when nobody else will pay the fee. */
export const DEFAULT_MON_FAUCET_URL = "https://faucet.monad.xyz";

/** Same address on every chain that has it, Monad mainnet and testnet included. */
export const MULTICALL3_ADDRESS: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

export const multicall3Abi = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
]);

export function isTestnetFaucetChain(chainId: number): boolean {
  return chainId !== MONAD_MAINNET_ID;
}

export function hasLowGas(balanceWei: bigint): boolean {
  return balanceWei < LOW_GAS_WEI;
}

export type TestMoneyMint = { symbol: TokenKey; token: Address; units: bigint };

/** The mints to make: every demo token this deployment actually has. Missing ones are skipped. */
export function testMoneyMints(deployment: Deployment): TestMoneyMint[] {
  const out: TestMoneyMint[] = [];
  for (const symbol of Object.keys(TEST_MONEY_UNITS) as TokenKey[]) {
    const token = deployment.tokens[symbol];
    if (!token || /^0x0{40}$/i.test(token)) continue;
    out.push({ symbol, token, units: TEST_MONEY_UNITS[symbol] });
  }
  return out;
}

/** The Multicall3 calls that mint every demo token to `to`. Exported for testing. */
export function testMoneyCalls(deployment: Deployment, to: Address) {
  return testMoneyMints(deployment).map((m) => ({
    target: m.token,
    allowFailure: false,
    callData: encodeFunctionData({ abi: MockERC20Abi, functionName: "mint", args: [to, m.units] }),
  }));
}

/**
 * Mints every demo token to the wallet's own account, in one transaction.
 *
 * Multicall3 is the caller of `mint`, which is fine because `mint` takes the recipient as an
 * argument and is open to anyone. One signature instead of four is the point.
 */
export async function mintTestMoney(wallet: WalletClient, deployment: Deployment): Promise<Hex> {
  if (!isTestnetFaucetChain(deployment.chainId)) {
    throw new Error("Test money only exists on the test network.");
  }
  const account = wallet.account;
  if (!account) throw new Error("Wallet client has no account connected");
  const calls = testMoneyCalls(deployment, account.address);
  if (calls.length === 0) throw new Error("There are no demo tokens on this network.");
  return wallet.writeContract({
    address: MULTICALL3_ADDRESS,
    abi: multicall3Abi,
    functionName: "aggregate3",
    args: [calls],
    account,
    chain: wallet.chain,
  });
}

/**
 * True when an error from a wallet means "you can't pay the network fee".
 *
 * Wallets and nodes word this differently, so it matches the shapes seen in practice rather than
 * one exact string.
 */
export function isOutOfGasFundsError(err: unknown): boolean {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; cur && i < 6; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message, (cur as { shortMessage?: string }).shortMessage ?? "", cur.name);
      cur = (cur as { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  const text = parts.join(" ").toLowerCase();
  return (
    text.includes("insufficient funds") ||
    text.includes("insufficientfundserror") ||
    text.includes("insufficient balance for transfer") ||
    text.includes("gas required exceeds allowance") ||
    text.includes("not enough funds for gas")
  );
}
