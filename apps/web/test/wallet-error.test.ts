import { test } from "node:test";
import assert from "node:assert/strict";
import { walletActionMessage } from "../lib/wallet-error.ts";

test("wallet cancellation is short and confirms that nothing changed", () => {
  assert.equal(
    walletActionMessage({ code: 4001, message: "User rejected the request" }),
    "You cancelled the wallet request. Nothing was changed.",
  );
});

test("insufficient MON explains the fee problem without rendering the RPC payload", () => {
  assert.equal(
    walletActionMessage(
      new Error(
        "insufficient funds for gas * price + value: 0x" + "f".repeat(4000),
      ),
    ),
    "Your wallet does not have enough MON to pay the network fee. Add test MON, then try again.",
  );
});

test("reverts are safe and concise", () => {
  assert.equal(
    walletActionMessage(new Error("execution reverted: PLAN_NOT_ACTIVE")),
    "The network rejected that transaction. Nothing was changed.",
  );
});
