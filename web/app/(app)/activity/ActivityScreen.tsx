"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { EASE } from "@/components/ui/motion";
import { Button, Panel, Skeleton, TxLink } from "@/components/ui/primitives";
import { useWallet } from "@/components/wallet/WalletProvider";
import { formatAmount, formatWhen } from "@/lib/format";
import type { EscrowAction } from "@/lib/hodl/types";
import { useActivity, useUserEscrows } from "@/lib/hooks/queries";

const LABEL: Record<EscrowAction, { text: string; color: string }> = {
  created: { text: "Created", color: "#9CA39D" },
  funded: { text: "Locked", color: "#5BF0B0" },
  released: { text: "Released", color: "#7CC4FF" },
  refunded: { text: "Refunded", color: "#C3A6FF" },
  expired: { text: "Returned", color: "#FF8A7A" },
};

export function ActivityScreen() {
  const { address, ready, connect } = useWallet();
  const escrows = useUserEscrows(address);
  const activity = useActivity(address, escrows.data?.escrows);
  const titles = new Map(escrows.data?.escrows.map((e) => [e.id, e]) ?? []);

  // Who signed: the payer for everything except a refund.
  const mine = (action: EscrowAction, id: number) => {
    const e = titles.get(id);
    if (!e) return false;
    return action === "refunded" ? e.recipient === address : e.payer === address;
  };

  return (
    <main className="relative mx-auto flex max-w-[1160px] flex-col gap-5 px-[clamp(16px,3vw,32px)] pt-6 pb-20">
      <div className="rise d1 flex flex-col gap-2 pt-2 pb-1">
        <span className="eyebrow text-xs">Activity</span>
        <h1 className="font-serif text-[clamp(36px,4vw,50px)] leading-none font-normal tracking-[-0.02em]">
          Every receipt, <em className="text-faint">in one place.</em>
        </h1>
        <p className="max-w-[560px] text-[15px] text-muted">
          Every transaction on your escrows, read from contract events. Each hash opens on Stellar Expert.
        </p>
      </div>

      {ready && !address ? (
        <Panel className="flex flex-wrap items-center justify-between gap-4 p-6">
          <span className="text-muted">Connect a wallet to see its activity.</span>
          <Button variant="paper" size="sm" onClick={() => connect()}>
            Connect wallet
          </Button>
        </Panel>
      ) : !activity.data ? (
        <Skeleton className="h-[420px] rounded-[26px]" />
      ) : activity.data.events.length === 0 ? (
        <Panel className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-muted">No transactions yet.</p>
          <Link href="/escrow/new" className="text-mint hover:text-mint-hover">
            Start an escrow
          </Link>
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <div className="hidden grid-cols-[150px_minmax(0,1fr)_120px_140px_150px] gap-4 px-[22px] py-3.5 text-xs text-faint md:grid">
            <span>When</span>
            <span>Escrow</span>
            <span>Action</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Receipt</span>
          </div>
          <ol>
            {activity.data.events.map((ev, i) => {
              const e = titles.get(ev.escrowId);
              const look = LABEL[ev.action];
              return (
                <motion.li
                  key={ev.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 12) * 0.03 }}
                  className="row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-t border-white/[0.06] px-[22px] py-4 md:grid-cols-[150px_minmax(0,1fr)_120px_140px_150px]"
                >
                  <span className="order-3 font-mono text-xs text-faint md:order-none">{formatWhen(ev.at)}</span>
                  <Link href={`/escrow/${ev.escrowId}`} className="min-w-0 truncate font-semibold hover:text-mint">
                    <span className="font-mono text-faint">#{ev.escrowId}</span> {e?.title}
                  </Link>
                  <span className="order-4 inline-flex items-center gap-2 text-sm md:order-none">
                    <span className="size-2 rounded-full" style={{ background: look.color, boxShadow: `0 0 10px ${look.color}` }} />
                    {look.text}
                    {mine(ev.action, ev.escrowId) && <span className="text-xs text-faint">· you</span>}
                  </span>
                  <span className="text-right font-serif text-xl tabular">
                    {ev.amount ? formatAmount(ev.amount) : formatAmount(e?.amount ?? "0")}{" "}
                    <span className="font-mono text-[11px] text-faint">USDC</span>
                  </span>
                  <span className="order-5 text-right md:order-none">
                    <TxLink hash={ev.txHash} />
                  </span>
                </motion.li>
              );
            })}
          </ol>
          {activity.data.truncated && (
            <p className="border-t border-white/[0.06] px-[22px] py-4 text-xs text-faint">
              The public RPC keeps about a week of events, so older transactions aren&apos;t listed here. Each escrow page still
              shows when it was created, locked and closed.
            </p>
          )}
        </Panel>
      )}
    </main>
  );
}
