"use client";

import { useState } from "react";
import { AccordionItem, Reveal } from "@/components/ui/motion";

const QA: [string, string][] = [
  [
    "Does HodL ever hold my money?",
    "Never. Your USDC sits in the escrow contract on Stellar. The website has no keys, and no admin function can move or freeze your funds. Code upgrades happen in public on-chain, and can be locked for good.",
  ],
  [
    "What happens when the deadline passes?",
    "If you haven’t released the money, you can take the full amount back. Until you do, you can still choose to release it to the recipient.",
  ],
  [
    "Can the other person back out?",
    "Yes. The recipient can refund at any time, which sends the money straight back to the payer and closes the escrow.",
  ],
  ["Which wallets can I use?", "Freighter, xBull, Lobstr, Albedo and Hana, through Stellar Wallets Kit."],
  [
    "Is this real money?",
    "Not yet. HodL runs on Stellar Testnet with free test USDC from Circle’s faucet, so you can try everything without risk.",
  ],
  ["What does it cost?", "HodL takes no cut. You only pay Stellar’s network fees, which are a tiny amount of XLM per step."],
];

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-2.5">
      {QA.map(([q, a], i) => (
        <Reveal key={q} delay={i * 0.04}>
          <AccordionItem question={q} answer={a} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
        </Reveal>
      ))}
    </div>
  );
}
