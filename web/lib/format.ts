import { USDC_DECIMALS } from "./config";

const UNIT = 10n ** BigInt(USDC_DECIMALS);

/** "2500000000" (stroops of USDC) → "250.00"; keeps extra decimals only if present. */
export function formatAmount(raw: bigint | string, { grouping = true } = {}): string {
  const value = typeof raw === "bigint" ? raw : BigInt(raw);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / UNIT;
  const frac = (abs % UNIT).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  const wholeText = grouping ? whole.toLocaleString("en-US") : whole.toString();
  return `${negative ? "-" : ""}${wholeText}.${frac.padEnd(2, "0")}`;
}

/** "250" | "250.5" → 2505000000n. Returns null for anything that is not a valid amount. */
export function parseAmount(text: string): bigint | null {
  const clean = text.trim().replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{0,7}))?$/.exec(clean);
  if (!match) return null;
  return BigInt(match[1]) * UNIT + BigInt((match[2] ?? "").padEnd(USDC_DECIMALS, "0"));
}

/** Balance strings from Horizon ("1240.5000000") → "1,240.50". */
export function formatBalance(balance: string | number): string {
  return formatAmount(parseAmount(String(balance)) ?? 0n);
}

/** Whole-unit label for buttons: "Lock 250 USDC", "Release 12.5 USDC". */
export function amountLabel(raw: bigint | string): string {
  return formatAmount(raw).replace(/\.00$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** GCX4…7QPA */
export const shortAddress = (address: string) =>
  address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;

/** a3f9…7c21 */
export const shortHash = (hash: string) => `${hash.slice(0, 4)}…${hash.slice(-4)}`;

/** Two-letter avatar text: "GC". */
export const initials = (address: string) => address.slice(0, 2).toUpperCase();

/** A stable colour per address for avatar tiles (mint, lilac, sky, coral). */
const AVATAR_COLORS = ["#5BF0B0", "#C3A6FF", "#7CC4FF", "#FF8A7A"];
export function avatarColor(address: string): string {
  let h = 0;
  for (const ch of address) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** "6d 23h", "21h 40m", "3m 05s", or null once passed. */
export function timeLeft(deadlineSec: number, nowMs = Date.now()): string | null {
  let s = Math.floor(deadlineSec - nowMs / 1000);
  if (s <= 0) return null;
  const d = Math.floor(s / 86_400);
  s -= d * 86_400;
  const h = Math.floor(s / 3_600);
  s -= h * 3_600;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}m ${pad(sec)}s`;
}

const dateFmt = (opts: Intl.DateTimeFormatOptions) => (sec: number) =>
  new Intl.DateTimeFormat("en-GB", opts).format(new Date(sec * 1000));

/** "20 Oct · 17:31" */
export const formatWhen = (sec: number) =>
  `${dateFmt({ day: "numeric", month: "short" })(sec)} · ${dateFmt({ hour: "2-digit", minute: "2-digit", hour12: false })(sec)}`;
/** "20 Oct, 17:31" */
export const formatShort = (sec: number) =>
  `${dateFmt({ day: "numeric", month: "short" })(sec)}, ${dateFmt({ hour: "2-digit", minute: "2-digit", hour12: false })(sec)}`;
/** "Monday 27 October, 17:30" */
export const formatLong = (sec: number) =>
  `${dateFmt({ weekday: "long", day: "numeric", month: "long" })(sec)}, ${dateFmt({ hour: "2-digit", minute: "2-digit", hour12: false })(sec)}`;
/** "20 Oct 2026" */
export const formatDay = dateFmt({ day: "numeric", month: "short", year: "numeric" });
/** "18 Oct" */
export const formatDayShort = dateFmt({ day: "numeric", month: "short" });
