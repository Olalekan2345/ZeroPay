import { formatEther } from "viem";

export function fmt0G(wei: string | bigint, digits = 4): string {
  try {
    const n = Number(formatEther(BigInt(wei)));
    return `${n.toLocaleString(undefined, { maximumFractionDigits: digits })} 0G`;
  } catch {
    return "0 0G";
  }
}

/** Returns "X 0G (~$Y)" when price is known, otherwise just "X 0G" */
export function fmt0GWithUSD(wei: string | bigint, usdPrice: number | null, digits = 4): string {
  const base = fmt0G(wei, digits);
  if (!usdPrice) return base;
  try {
    const tokens = Number(formatEther(BigInt(wei)));
    const usd = tokens * usdPrice;
    const fmtUsd = usd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
    return `${base} (≈${fmtUsd})`;
  } catch {
    return base;
  }
}

/** Convert a plain token float (not wei) to USD string */
export function tokenToUSD(tokens: number, usdPrice: number | null): string | null {
  if (!usdPrice) return null;
  const usd = tokens * usdPrice;
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function short(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export function dateTime(ms: number) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

export function dayLabel(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
