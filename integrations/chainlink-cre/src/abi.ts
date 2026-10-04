/**
 * ABI encoding for the CRE workflow.
 *
 * The workflow reads Modalis contracts through the CRE EVM capability, which takes and returns
 * raw bytes, so calldata is built and results decoded here. Protobuf JSON encodes `bytes` fields
 * as base64, which is why every boundary goes through the helpers at the bottom.
 */
import {
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbi,
  toHex,
  type Address,
  type Hex,
} from "viem";

/** Only the three reads and one write the workflow needs. */
export const MODALIS_READ_ABI = parseAbi([
  "function portfolioState(address owner) view returns (address[] tokens, uint256[] values, uint256 total)",
  "function mandateOf(address owner) view returns (uint256 targetValue, uint64 targetDate, uint16 maxDrawdownBps, uint16 minLiquidityBps, uint16 rebalanceThresholdBps, uint16 maxSingleAssetBps, uint16 maxSlippageBps, bool active, uint32 version)",
  "function allocationsOf(address owner) view returns ((address token, uint16 targetBps, uint16 minBps, uint16 maxBps)[])",
  "function getAsset(address token) view returns ((address token, address oracle, uint16 maxBps, uint8 decimals, bool enabled, bool isLiquid, string symbol))",
]);

export type RiskStatusCode = 0 | 1 | 2; // OK | DRIFT | BREACH

/**
 * The payload RiskSignalReceiver.onReport decodes:
 *   abi.decode(report, (address, uint8, uint32, uint256, uint256, bytes32))
 * Keep this in lockstep with that contract.
 */
export const RISK_REPORT_PARAMS = [
  { type: "address", name: "owner" },
  { type: "uint8", name: "status" },
  { type: "uint32", name: "mandateVersion" },
  { type: "uint256", name: "maxDriftBps" },
  { type: "uint256", name: "totalValue" },
  { type: "bytes32", name: "reasonHash" },
] as const;

export function encodeRiskReport(input: {
  owner: Address;
  status: RiskStatusCode;
  mandateVersion: number;
  maxDriftBps: bigint;
  totalValue: bigint;
  reason: string;
}): Hex {
  return encodeAbiParameters(RISK_REPORT_PARAMS, [
    input.owner,
    input.status,
    input.mandateVersion,
    input.maxDriftBps,
    input.totalValue,
    keccak256(toHex(input.reason)),
  ]);
}

export function callPortfolioState(owner: Address): Hex {
  return encodeFunctionData({ abi: MODALIS_READ_ABI, functionName: "portfolioState", args: [owner] });
}

export function callMandateOf(owner: Address): Hex {
  return encodeFunctionData({ abi: MODALIS_READ_ABI, functionName: "mandateOf", args: [owner] });
}

export function callAllocationsOf(owner: Address): Hex {
  return encodeFunctionData({ abi: MODALIS_READ_ABI, functionName: "allocationsOf", args: [owner] });
}

export function callGetAsset(token: Address): Hex {
  return encodeFunctionData({ abi: MODALIS_READ_ABI, functionName: "getAsset", args: [token] });
}

export function decodePortfolioState(data: Hex): { tokens: Address[]; values: bigint[]; total: bigint } {
  const [tokens, values, total] = decodeAbiParameters(
    [{ type: "address[]" }, { type: "uint256[]" }, { type: "uint256" }],
    data,
  );
  return { tokens: [...tokens] as Address[], values: [...values] as bigint[], total: total as bigint };
}

export type DecodedMandate = {
  targetValue: bigint;
  targetDate: number;
  maxDrawdownBps: number;
  minLiquidityBps: number;
  rebalanceThresholdBps: number;
  maxSingleAssetBps: number;
  maxSlippageBps: number;
  active: boolean;
  version: number;
};

export function decodeMandate(data: Hex): DecodedMandate {
  // mandateOf returns a single struct, so the outer tuple wraps the nine fields.
  const [m] = decodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { type: "uint256" },
          { type: "uint64" },
          { type: "uint16" },
          { type: "uint16" },
          { type: "uint16" },
          { type: "uint16" },
          { type: "uint16" },
          { type: "bool" },
          { type: "uint32" },
        ],
      },
    ],
    data,
  );
  const t = m as readonly [bigint, bigint, number, number, number, number, number, boolean, number];
  return {
    targetValue: t[0],
    targetDate: Number(t[1]),
    maxDrawdownBps: Number(t[2]),
    minLiquidityBps: Number(t[3]),
    rebalanceThresholdBps: Number(t[4]),
    maxSingleAssetBps: Number(t[5]),
    maxSlippageBps: Number(t[6]),
    active: t[7],
    version: Number(t[8]),
  };
}

export type DecodedAllocation = { token: Address; targetBps: number; minBps: number; maxBps: number };

export function decodeAllocations(data: Hex): DecodedAllocation[] {
  const [rows] = decodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [{ type: "address" }, { type: "uint16" }, { type: "uint16" }, { type: "uint16" }],
      },
    ],
    data,
  );
  return (rows as readonly (readonly [Address, number, number, number])[]).map((r) => ({
    token: r[0],
    targetBps: Number(r[1]),
    minBps: Number(r[2]),
    maxBps: Number(r[3]),
  }));
}

export function decodeAsset(data: Hex): { isLiquid: boolean; maxBps: number; symbol: string; decimals: number } {
  const [a] = decodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { type: "address" },
          { type: "address" },
          { type: "uint16" },
          { type: "uint8" },
          { type: "bool" },
          { type: "bool" },
          { type: "string" },
        ],
      },
    ],
    data,
  );
  const t = a as readonly [Address, Address, number, number, boolean, boolean, string];
  return { maxBps: Number(t[2]), decimals: Number(t[3]), isLiquid: t[5], symbol: t[6] };
}

// --------------------------------------------------------- protobuf JSON bytes

/** Protobuf JSON represents `bytes` as base64, so hex must be converted at the boundary. */
export function hexToBase64(hex: Hex): string {
  return Buffer.from(hex.slice(2), "hex").toString("base64");
}

export function base64ToHex(b64: string): Hex {
  return `0x${Buffer.from(b64, "base64").toString("hex")}`;
}

/** Accepts either encoding, since a capability may return hex or base64 depending on transport. */
export function toHexFlexible(value: string | Uint8Array): Hex {
  if (value instanceof Uint8Array) return `0x${Buffer.from(value).toString("hex")}`;
  return value.startsWith("0x") ? (value as Hex) : base64ToHex(value);
}
