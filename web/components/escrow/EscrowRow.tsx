"use client";

import Link from "next/link";
import { Countdown } from "@/components/ui/motion";
import { Avatar, StatusBadge } from "@/components/ui/primitives";
import { formatAmount, formatDayShort, shortAddress } from "@/lib/format";
import { isClosed, phaseOf, roleOf, type Phase } from "@/lib/hodl/phase";
import type { Escrow } from "@/lib/hodl/types";

/** One line in "All escrows": counterparty, title, status, time, amount. */
export function EscrowRow({ escrow, me, now }: { escrow: Escrow; me: string; now: number }) {
  const phase = phaseOf(escrow, now / 1000);
  const paying = roleOf(escrow, me) === "payer";
  const other = paying ? escrow.recipient : escrow.payer;
  return (
    <Link
      href={`/escrow/${escrow.id}`}
      className="row flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-white/[0.06] px-[22px] py-[18px] text-paper"
    >
      <Avatar address={other} size={40} radius={12} soft />
      <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-[3px]">
        <span className="truncate font-semibold">{escrow.title || `Escrow #${escrow.id}`}</span>
        <span className="text-[13px] text-faint">
          <span className="font-mono">#{escrow.id}</span> · {describe(phase, paying)}{" "}
          {phase !== "expired" && <span className="font-mono">{shortAddress(other)}</span>}
        </span>
      </span>
      <span className="flex-[0_0_120px]">
        <StatusBadge phase={phase} pulse={false} />
      </span>
      <span className="flex-[0_0_104px] text-[13px] text-muted">
        {isClosed(phase) ? (
          <span className="text-faint">{formatDayShort(escrow.closedAt)}</span>
        ) : (
          <Countdown deadline={escrow.deadline} passedText="Deadline passed" />
        )}
      </span>
      <span
        className="ml-auto flex-[0_0_130px] text-right font-serif text-2xl tabular"
        style={{ color: phase === "created" || phase === "createdExpired" ? "#7A827B" : undefined }}
      >
        {formatAmount(escrow.amount)} <span className="font-mono text-[11px] text-faint">USDC</span>
      </span>
    </Link>
  );
}

function describe(phase: Phase, paying: boolean): string {
  switch (phase) {
    case "released":
      return paying ? "You paid" : "Paid you ·";
    case "refunded":
      return paying ? "Refunded to you by" : "You refunded";
    case "expired":
      return paying ? "Returned to you after the deadline" : "Returned to the payer";
    default:
      return paying ? "You're paying" : "Paying you ·";
  }
}
