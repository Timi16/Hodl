"use client";

import { AnimatePresence, motion } from "motion/react";
import { AnimatedAmount, AnimatedLock, EASE } from "@/components/ui/motion";
import { Avatar, StatusBadge, TxLink } from "@/components/ui/primitives";
import { VaultRing } from "@/components/ui/VaultRing";
import { cn } from "@/lib/cn";
import { formatAmount, formatDay, formatShort, formatWhen, shortAddress } from "@/lib/format";
import { LOOK, isClosed, isLocked, type Phase, type Role } from "@/lib/hodl/phase";
import type { Escrow, EscrowEvent, EscrowHistory } from "@/lib/hodl/types";

const FINAL_FILL: Partial<Record<Phase, string>> = { released: "#7CC4FF", refunded: "#C3A6FF", expired: "#FF8A7A" };

/** The hero card: status, title, payer → ring → recipient, and the three steps. */
export function EscrowStage({ escrow, phase, role }: { escrow: Escrow; phase: Phase; role: Role }) {
  const look = LOOK[phase];
  const locked = isLocked(phase);
  const amountColor = phase === "created" || phase === "createdExpired" ? "#9CA39D" : look.fg;
  return (
    <section
      aria-label="Escrow"
      className="rise d2 relative flex flex-col gap-6 overflow-hidden rounded-[32px] border border-white/[0.07] bg-panel p-[clamp(22px,3vw,34px)]"
    >
      <motion.div
        aria-hidden="true"
        className="breathe pointer-events-none absolute top-[42%] left-1/2 -mt-[210px] -ml-[260px] h-[420px] w-[520px] rounded-full blur-[80px]"
        animate={{ backgroundColor: `rgb(${look.rgb} / 0.14)` }}
        transition={{ duration: 0.8 }}
      />

      <div className="relative flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={phase}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <StatusBadge phase={phase} size="md" />
            </motion.span>
          </AnimatePresence>
          <span className="font-mono text-xs text-faint">
            #{escrow.id} · Created {formatDay(escrow.createdAt)}
          </span>
        </div>
        <h1 className="font-serif text-[clamp(30px,3.4vw,42px)] leading-[1.05] font-normal tracking-[-0.02em] break-words">
          {escrow.title || `Escrow #${escrow.id}`}
        </h1>
      </div>

      <div className="relative flex flex-wrap items-center justify-center gap-x-7 gap-y-4 py-2">
        <Party address={escrow.payer} label="Payer" you={role === "payer"} color="#5BF0B0" className="float" />
        <VaultRing
          rgb={look.rgb}
          dot={amountColor}
          disc
          className="w-[min(320px,100%)] shrink-0"
          label={`${formatAmount(escrow.amount)} USDC, ${look.badge.toLowerCase()}`}
        >
          <motion.span
            className="flex size-14 items-center justify-center rounded-[18px] border"
            initial={false}
            animate={
              locked
                ? { backgroundColor: look.fg, borderColor: look.fg, boxShadow: `0 0 40px rgb(${look.rgb} / 0.45)` }
                : {
                    backgroundColor: `rgb(${look.rgb} / 0.12)`,
                    borderColor: `rgb(${look.rgb} / 0.35)`,
                    boxShadow: "0 0 0px rgb(0 0 0 / 0)",
                  }
            }
            transition={{ duration: 0.5, ease: EASE }}
          >
            <AnimatedLock locked={locked} color={locked ? "#060807" : amountColor} hole={look.fg} />
          </motion.span>
          <span className="font-mono text-[10px] tracking-[0.14em] text-faint">{look.slipLabel}</span>
          <span className="flex items-baseline gap-1.5">
            <span className="font-serif text-[50px] leading-none tracking-[-0.02em] tabular" style={{ color: amountColor }}>
              <AnimatedAmount raw={escrow.amount} />
            </span>
            <span className="font-mono text-xs text-muted">USDC</span>
          </span>
        </VaultRing>
        <Party address={escrow.recipient} label="Recipient" you={role === "recipient"} color="#C3A6FF" className="float2" />
      </div>

      <Steps escrow={escrow} phase={phase} />
    </section>
  );
}

function Party({
  address,
  label,
  you,
  color,
  className,
}: {
  address: string;
  label: string;
  you: boolean;
  color: string;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 flex-col items-center gap-2 text-center", className)}>
      <Avatar address={address} size={52} radius={16} color={color} />
      <span className="flex items-center gap-1.5 text-xs text-faint">
        {label}
        {you && <span className="rounded-full bg-paper px-[7px] py-px text-[11px] font-bold text-night">You</span>}
      </span>
      <span className="font-mono text-[13px]" title={address}>
        {shortAddress(address)}
      </span>
    </div>
  );
}

function Steps({ escrow, phase }: { escrow: Escrow; phase: Phase }) {
  const closed = isClosed(phase);
  const neverLocked = escrow.fundedAt === 0;
  const finalFill = FINAL_FILL[phase];
  const finalLabel: Record<Phase, string> = {
    created: "Released",
    funded: "Released",
    expiredClaimable: "Take it back",
    createdExpired: "Close it",
    released: "Released",
    refunded: "Refunded",
    expired: neverLocked ? "Closed" : "Returned",
  };
  const finalSub: Record<Phase, string> = {
    created: "After locking",
    funded: "When the payer releases",
    expiredClaimable: "Available now",
    createdExpired: "Nothing to return",
    released: formatShort(escrow.closedAt),
    refunded: formatShort(escrow.closedAt),
    expired: formatShort(escrow.closedAt),
  };

  type S = { label: string; sub: string; state: "done" | "active" | "todo" | "warn" | "final"; fill?: string };
  const lockState: S["state"] =
    escrow.fundedAt > 0 ? "done" : phase === "created" ? "active" : phase === "createdExpired" ? "warn" : "todo";
  const steps: S[] = [
    { label: "Agreed", sub: formatShort(escrow.createdAt), state: "done" },
    {
      label: "Locked",
      sub: escrow.fundedAt > 0 ? formatShort(escrow.fundedAt) : phase === "created" ? "Waiting for the payer" : "Never locked",
      state: lockState,
    },
    {
      label: finalLabel[phase],
      sub: finalSub[phase],
      state: closed ? "final" : phase === "expiredClaimable" || phase === "createdExpired" ? "warn" : "todo",
      fill: finalFill,
    },
  ];
  const lineColor = (i: number) => {
    const next = steps[i + 1].state;
    if (next === "todo") return "rgba(255,255,255,0.1)";
    if (next === "warn") return "#FF8A7A";
    if (next === "final") return steps[i + 1].fill ?? "#EDEFEA";
    return closed ? "#EDEFEA" : "#5BF0B0";
  };

  return (
    <ol aria-label="Progress" className="relative flex border-t border-white/[0.07] pt-[22px]">
      {steps.map((s, i) => {
        const tone =
          s.state === "done"
            ? { bg: i === 1 && !closed ? "#5BF0B0" : "#EDEFEA", fg: "#060807", border: i === 1 && !closed ? "#5BF0B0" : "#EDEFEA" }
            : s.state === "final"
              ? { bg: s.fill!, fg: "#060807", border: s.fill! }
              : s.state === "active"
                ? { bg: "rgba(0,0,0,0)", fg: "#5BF0B0", border: "#5BF0B0" }
                : s.state === "warn"
                  ? { bg: "rgba(0,0,0,0)", fg: "#FF8A7A", border: "#FF8A7A" }
                  : { bg: "rgba(0,0,0,0)", fg: "#7A827B", border: "rgba(255,255,255,0.15)" };
        const filled = s.state === "done" || s.state === "final";
        return (
          <li key={i} className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex items-center">
              <motion.span
                initial={false}
                animate={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.fg }}
                transition={{ duration: 0.4 }}
                className="flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold"
              >
                {filled ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <motion.path d="M5 12l5 5L20 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.1 * i }} />
                  </svg>
                ) : (
                  i + 1
                )}
              </motion.span>
              {i < steps.length - 1 && (
                <span className="mx-2.5 h-0.5 grow overflow-hidden rounded-sm bg-white/10">
                  <motion.span
                    className="block h-full origin-left"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1, backgroundColor: lineColor(i) }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.2 + 0.15 * i }}
                  />
                </span>
              )}
            </div>
            <div className="flex flex-col gap-0.5 pr-2.5">
              <span
                className="text-sm font-semibold"
                style={{ color: s.state === "active" ? "#5BF0B0" : s.state === "warn" ? "#FF8A7A" : s.state === "todo" ? "#7A827B" : "#EDEFEA" }}
              >
                {s.label}
              </span>
              <span className="text-xs text-faint">{s.sub}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------- receipts

const DOT: Record<EscrowEvent["action"], string> = {
  created: "#9CA39D",
  funded: "#5BF0B0",
  released: "#7CC4FF",
  refunded: "#C3A6FF",
  expired: "#FF8A7A",
};

function describeEvent(e: EscrowEvent, escrow: Escrow, role: Role): { title: string; desc: string } {
  const amount = `${formatAmount(e.amount ?? escrow.amount)} USDC`;
  switch (e.action) {
    case "created": {
      const days = Math.max(1, Math.round((escrow.deadline - escrow.createdAt) / 86_400));
      return { title: "Escrow created", desc: `Set up by ${role === "payer" ? "you" : "the payer"} with a ${days}-day deadline` };
    }
    case "funded":
      return { title: `${amount} locked`, desc: "Moved from the payer into the contract" };
    case "released":
      return { title: "Released", desc: `${amount} paid to ${shortAddress(escrow.recipient)}` };
    case "refunded":
      return { title: "Refunded", desc: `The recipient sent ${amount} back` };
    case "expired":
      return e.amount === "0"
        ? { title: "Closed", desc: "The deadline passed before it was locked" }
        : { title: "Taken back", desc: `${amount} returned to the payer` };
  }
}

/** History rows, newest first. Falls back to the contract's own timestamps past the RPC window. */
export function Receipts({
  escrow,
  role,
  history,
  loading,
  phase,
}: {
  escrow: Escrow;
  role: Role;
  history: EscrowHistory | undefined;
  loading: boolean;
  phase: Phase;
}) {
  type Row = { key: string; title: string; desc: string; when: number; hash?: string; dot: string };
  let rows: Row[] = (history?.events ?? []).map((e) => ({
    key: e.id,
    ...describeEvent(e, escrow, role),
    when: e.at,
    hash: e.txHash,
    dot: DOT[e.action],
  }));
  if (!loading && (history?.truncated || rows.length === 0)) {
    // Older than the RPC event window: rebuild from the stored timestamps.
    rows = [
      { key: "c", title: "Escrow created", desc: "Recorded in the contract", when: escrow.createdAt, dot: DOT.created },
      ...(escrow.fundedAt ? [{ key: "f", title: `${formatAmount(escrow.amount)} USDC locked`, desc: "Moved into the contract", when: escrow.fundedAt, dot: DOT.funded }] : []),
      ...(escrow.closedAt ? [{ key: "x", title: LOOK[phase].badge, desc: "This escrow is closed", when: escrow.closedAt, dot: LOOK[phase].fg }] : []),
    ].reverse();
  }
  if (phase === "expiredClaimable") {
    rows.unshift({ key: "d", title: "Deadline passed", desc: "The payer can now take the money back", when: escrow.deadline, dot: "#FF8A7A" });
  }

  return (
    <section aria-labelledby="receipts" className="rise d4 flex flex-col gap-[18px] rounded-[26px] border border-white/[0.07] bg-panel p-6">
      <h2 id="receipts" className="eyebrow">
        Receipts
      </h2>
      {loading && !history ? (
        <div className="flex flex-col gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      ) : (
        <ol className="ml-1.5 flex flex-col gap-5 border-l border-white/10 pl-[22px]">
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <motion.li
                key={r.key}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="relative flex flex-col gap-1"
              >
                <span
                  className="absolute top-1 -left-[29px] size-[13px] rounded-full border-[3px] border-panel"
                  style={{ background: r.dot, boxShadow: `0 0 12px ${r.dot}` }}
                />
                <span className="text-[15px] font-semibold">{r.title}</span>
                <span className="text-sm text-muted">{r.desc}</span>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-faint">{formatWhen(r.when)}</span>
                  {r.hash && <TxLink hash={r.hash} />}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
      {history?.truncated && (
        <p className="text-xs leading-normal text-faint">
          Older than the public RPC&apos;s event window, so hashes before then aren&apos;t listed. The times above come from the contract itself.
        </p>
      )}
    </section>
  );
}
