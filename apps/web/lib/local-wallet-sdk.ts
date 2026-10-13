/**
 * Compile boundary for the explicitly local Anvil demo only. LocalWallet supplies the real
 * unlocked RPC signer. Cloud wallet SDK hooks must never be reached in this mode; no token,
 * account or signature is synthesized here. Production always resolves the actual SDK.
 */
function unavailable(): never {
  throw new Error(
    "Cloud sign-in is unavailable in the local Anvil demo. Use the local account.",
  );
}
export const DynamicContextProvider = unavailable;
export const useDynamicContext = unavailable;
export const useIsLoggedIn = unavailable;
export const getAuthToken = unavailable;
export const EthereumWalletConnectors = unavailable;
export const isEthereumWallet = unavailable;
