/**
 * Creates the Modalis agent as a Dynamic server wallet and prints the settings to store.
 *
 *   DYNAMIC_API_TOKEN=dyn_... NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=... pnpm agent:create
 *
 * Optional: DYNAMIC_AGENT_PASSWORD encrypts our key shares; set the same value wherever the agent
 * signs. Run it once. Running it again makes a different wallet, and every plan that allowed the
 * old one would have to allow the new one.
 *
 * Prints DYNAMIC_AGENT_WALLET (a secret: it is our half of the key) and the public address.
 */
import { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";
import { encodeAgentWallet } from "../src/agent-env.ts";

const apiToken = process.env.DYNAMIC_API_TOKEN?.trim();
const environmentId = (process.env.DYNAMIC_ENVIRONMENT_ID || process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID)?.trim();
if (!apiToken || !environmentId) {
  console.error("Set DYNAMIC_API_TOKEN and NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID first.");
  process.exit(1);
}

const client = new DynamicEvmWalletClient({ environmentId });
await client.authenticateApiToken(apiToken);
const created = await client.createWalletAccount({
  thresholdSignatureScheme: "TWO_OF_TWO" as never,
  password: process.env.DYNAMIC_AGENT_PASSWORD || undefined,
  backUpToDynamic: false,
  onError: (err: Error) => console.error(err.message),
});

const wallet = {
  walletMetadata: created.walletMetadata as unknown as { accountAddress: string } & Record<string, unknown>,
  externalServerKeyShares: created.externalServerKeyShares as unknown[],
};

console.log(`DYNAMIC_AGENT_ADDRESS=${wallet.walletMetadata.accountAddress}`);
console.log(`DYNAMIC_AGENT_WALLET=${encodeAgentWallet(wallet)}`);
