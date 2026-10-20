"use client";

import { motion } from "motion/react";
import { EASE } from "@/components/ui/motion";

const NODES = [
  { id: "Created", color: "#B7BDB8", note: "Agreed, nothing locked", col: 0 },
  { id: "Funded", color: "#5BF0B0", note: "USDC in the contract", col: 1 },
  { id: "Released", color: "#7CC4FF", note: "Paid to the recipient", col: 2 },
  { id: "Refunded", color: "#C3A6FF", note: "Sent back by the recipient", col: 2 },
  { id: "Expired", color: "#FF8A7A", note: "Back to the payer after the deadline", col: 2 },
];

const EDGES = [
  ["Created", "Funded", "fund · payer"],
  ["Funded", "Released", "release · payer"],
  ["Funded", "Refunded", "refund · recipient"],
  ["Funded", "Expired", "claim_expired · payer"],
] as const;

/** The state machine, drawn as three columns that collapse to one on phones. */
export function StateDiagram() {
  return (
    <section aria-labelledby="states" className="relative overflow-hidden rounded-[30px] border border-white/[0.07] bg-panel p-[clamp(22px,3vw,34px)]">
      <h2 id="states" className="mb-6 font-serif text-[26px]">
        The state machine
      </h2>
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.2fr] md:items-center">
        {[0, 1, 2].map((col) => (
          <div key={col} className="flex flex-col gap-3">
            {NODES.filter((n) => n.col === col).map((n, i) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: EASE, delay: col * 0.25 + i * 0.1 }}
                className="flex items-center gap-3 rounded-2xl border px-4 py-3.5"
                style={{ borderColor: `${n.color}55`, background: `${n.color}10` }}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: n.color, boxShadow: `0 0 12px ${n.color}` }} />
                <span className="flex flex-col">
                  <span className="font-mono text-sm font-semibold" style={{ color: n.color }}>
                    {n.id}
                  </span>
                  <span className="text-xs text-muted">{n.note}</span>
                </span>
              </motion.div>
            ))}
          </div>
        ))}
      </div>
      <ul className="mt-6 flex flex-wrap gap-2 border-t border-white/[0.07] pt-5">
        {EDGES.map(([from, to, how], i) => (
          <motion.li
            key={how}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.6 + i * 0.08 }}
            className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-muted"
          >
            {from} → {to} <span className="text-faint">· {how}</span>
          </motion.li>
        ))}
        <li className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-muted">
          Created → Expired <span className="text-faint">· claim_expired, nothing to return</span>
        </li>
      </ul>
      <p className="mt-4 text-[13px] leading-relaxed text-faint">
        A Funded escrow past its deadline stays stored as Funded until someone acts; reads report it as Expired, so no cron
        job is needed. The payer can still release, or the recipient refund, until it is claimed.
      </p>
    </section>
  );
}
