import type { Escrow } from "./types";

/**
 * What the UI shows, derived from the stored status and the deadline at
 * "now", so the screen flips to "deadline passed" without waiting for a refetch.
 */
export type Phase =
  | "created" // agreed, not locked
  | "createdExpired" // deadline passed before it was ever locked
  | "funded" // locked, before the deadline
  | "expiredClaimable" // locked, deadline passed: payer can take it back
  | "released"
  | "refunded"
  | "expired"; // closed by claim_expired

export type Role = "payer" | "recipient" | "viewer";

export function phaseOf(e: Escrow, nowSec = Date.now() / 1000): Phase {
  const past = nowSec >= e.deadline;
  switch (e.status) {
    case "Created":
      return past ? "createdExpired" : "created";
    case "Funded":
      return past ? "expiredClaimable" : "funded";
    case "Released":
      return "released";
    case "Refunded":
      return "refunded";
    case "Expired":
      return "expired";
  }
}

export function roleOf(e: Escrow, address: string | null | undefined): Role {
  if (!address) return "viewer";
  if (address === e.payer) return "payer";
  if (address === e.recipient) return "recipient";
  return "viewer";
}

export const isClosed = (p: Phase) => p === "released" || p === "refunded" || p === "expired";
export const isLocked = (p: Phase) => p === "funded" || p === "expiredClaimable";

/** Colour and words per phase. One colour per status, used everywhere. */
export interface PhaseLook {
  badge: string;
  /** "r g b" for rgba(), and the solid foreground colour. */
  rgb: string;
  fg: string;
  slipLabel: string;
}

export const LOOK: Record<Phase, PhaseLook> = {
  created: { badge: "Not funded yet", rgb: "156 163 157", fg: "#B7BDB8", slipLabel: "NOT LOCKED YET" },
  createdExpired: { badge: "Expired", rgb: "255 138 122", fg: "#FF8A7A", slipLabel: "NEVER LOCKED" },
  funded: { badge: "Locked", rgb: "91 240 176", fg: "#5BF0B0", slipLabel: "LOCKED IN CONTRACT" },
  expiredClaimable: { badge: "Deadline passed", rgb: "255 138 122", fg: "#FF8A7A", slipLabel: "READY TO TAKE BACK" },
  released: { badge: "Released", rgb: "124 196 255", fg: "#7CC4FF", slipLabel: "PAID TO RECIPIENT" },
  refunded: { badge: "Refunded", rgb: "195 166 255", fg: "#C3A6FF", slipLabel: "REFUNDED TO PAYER" },
  expired: { badge: "Returned", rgb: "255 138 122", fg: "#FF8A7A", slipLabel: "RETURNED TO PAYER" },
};
