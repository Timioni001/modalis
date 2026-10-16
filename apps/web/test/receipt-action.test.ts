import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
} from "viem";
import { PortfolioVaultAbi, MockERC20Abi } from "@modalis/chain";
import { receiptAction } from "../lib/receipt-action.ts";
const owner = "0x3000000000000000000000000000000000000001" as Address;
const stranger = "0x3000000000000000000000000000000000000002" as Address;
const contracts = {
  vault: "0x1000000000000000000000000000000000000002",
  mandate: "0x1000000000000000000000000000000000000001",
  tokens: ["0x2000000000000000000000000000000000000001"],
};
function receipt(
  event: "Deposited" | "Withdrawn",
  amount = 1n,
  eventOwner = owner,
  address = contracts.vault,
) {
  return {
    status: "success",
    from: owner,
    logs: [
      {
        address,
        topics: encodeEventTopics({
          abi: PortfolioVaultAbi,
          eventName: event,
          args: { owner: eventOwner, token: contracts.tokens[0] as Address },
        }) as Hex[],
        data: encodeAbiParameters([{ type: "uint256" }], [amount]),
      },
    ],
  };
}
test("only actual vault events for this owner prove movement of money", () => {
  assert.equal(receiptAction(receipt("Deposited"), owner, contracts), "add");
  assert.equal(
    receiptAction(receipt("Withdrawn"), owner, contracts, "withdraw"),
    "withdraw",
  );
  assert.equal(
    receiptAction(receipt("Deposited"), owner, contracts, "withdraw"),
    null,
  );
  assert.equal(
    receiptAction(receipt("Deposited", 1n, stranger), owner, contracts),
    null,
  );
  assert.equal(
    receiptAction(receipt("Deposited", 1n, owner, stranger), owner, contracts),
    null,
  );
  assert.equal(receiptAction(receipt("Deposited", 0n), owner, contracts), null);
  assert.equal(
    receiptAction(
      { ...receipt("Deposited"), status: "reverted" },
      owner,
      contracts,
    ),
    null,
  );
  assert.equal(
    receiptAction(
      { ...receipt("Deposited"), from: stranger },
      owner,
      contracts,
    ),
    null,
  );
});
test("an unrelated token transfer cannot masquerade as a deposit", () => {
  const transfer = {
    address: contracts.tokens[0],
    topics: encodeEventTopics({
      abi: MockERC20Abi,
      eventName: "Transfer",
      args: { from: owner, to: stranger },
    }) as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [10n]),
  };
  assert.equal(
    receiptAction(
      { status: "success", from: owner, logs: [transfer] },
      owner,
      contracts,
      "add",
    ),
    null,
  );
});
