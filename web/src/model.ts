import {
  formatUnits,
  hexToString,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
export type Market = {
  id: bigint;
  question: Hex;
  closeTime: bigint;
  resolver: Address;
  yesPool: bigint;
  noPool: bigint;
  outcome: number;
  paidOut: bigint;
  yesBps: bigint;
  noBps: bigint;
  yesStake: bigint;
  noStake: bigint;
  claimable: bigint;
  claimed: boolean;
};
export const WINDOW = 604800n;
export function status(m: Market, now: bigint) {
  if (m.outcome)
    return (
      ["Unresolved", "Resolved yes", "Resolved no", "Refunds available"][
        m.outcome
      ] || "Unknown outcome"
    );
  return now < m.closeTime
    ? "Open"
    : now < m.closeTime + WINDOW
      ? "Awaiting resolver"
      : "Ready to void";
}
export const short = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
export const exact = (value: bigint, decimals: number) =>
  formatUnits(value, decimals);
export function amount(value: bigint, decimals: number) {
  const [whole, fraction] = exact(value, decimals).split(".");
  const digits = fraction?.slice(0, 4).replace(/0+$/, "");
  if (value > 0n && whole === "0" && !digits) return "<0.0001";
  return `${BigInt(whole).toLocaleString("en-US")}${digits ? "." + digits : ""}`;
}
export function parseAmount(text: string, decimals: number) {
  if (
    !/^\d+(\.\d+)?$/.test(text) ||
    (text.split(".")[1]?.length || 0) > decimals
  )
    throw Error(
      `Enter a positive ODMK amount with up to ${decimals} decimal places.`,
    );
  const value = parseUnits(text, decimals);
  if (value <= 0n || value >= 2n ** 256n)
    throw Error("Enter a positive ODMK amount within the token limit.");
  return value;
}
export function encodeQuestion(text: string) {
  if (
    !text.trim() ||
    text.includes("\0") ||
    new TextEncoder().encode(text).length > 32
  )
    throw Error("Use a question of 1–32 UTF-8 bytes, without null characters.");
  const encoded = stringToHex(text, { size: 32 });
  if (hexToString(encoded, { size: 32 }) !== text)
    throw Error("Question encoding did not round-trip.");
  return encoded;
}
export function question(hex: Hex) {
  try {
    const text = hexToString(hex, { size: 32 });
    return /^[\x20-\x7E\u00A0-\uFFFF]+$/u.test(text) && !text.includes("�")
      ? text
      : hex;
  } catch {
    return hex;
  }
}
const contractErrors: Record<string, string> = {
  MarketClosed: "Betting has closed. Refresh to see settlement options.",
  ResolverCannotBet: "The named resolver cannot bet from this address.",
  InvalidCloseTime:
    "Choose a closing time between one hour and 90 days ahead, then try again.",
  ResolutionNotOpen:
    "Resolution is only available in the seven days after closing. Refresh this market.",
  NotResolver: "Only the named resolver can settle this market.",
  AlreadySettled: "This market has already settled. Refresh to see the result.",
  VoidNotOpen: "Wait until the seven-day resolution window ends, then refresh.",
  AlreadyClaimed: "This wallet has already claimed. Refresh its position.",
  NothingToClaim: "This wallet has no payout to collect. Refresh its position.",
  NotSettled: "Wait for settlement before claiming.",
  ERC20InsufficientBalance:
    "Your ODMK balance is too low. Reduce the stake or add ODMK.",
  ERC20InsufficientAllowance: "Approve enough ODMK before placing the bet.",
};
export function errorMessage(error: unknown): string {
  type Detail = {
    code?: number;
    shortMessage?: string;
    message?: string;
    cause?: unknown;
    data?: { errorName?: string };
    reason?: string;
  };
  const original = error as Detail;
  let current: Detail | undefined = original;
  for (
    let i = 0;
    current && i < 10;
    i++, current = current.cause as Detail | undefined
  ) {
    if (
      current.code === 4001 ||
      /rejected|denied/i.test(current.shortMessage || current.message || "")
    )
      return "Request rejected in your wallet. Nothing was submitted; you can try again.";
    if (current.data?.errorName) {
      const name = current.data.errorName;
      return `${contractErrors[name] || "The contract refused this request. Refresh and review the action."} (${name})`;
    }
    if (current.reason)
      return `Contract reverted: ${current.reason}. Refresh and review the action.`;
  }
  return (
    original.shortMessage ||
    original.message ||
    "Unable to complete this request. Refresh and try again."
  );
}
