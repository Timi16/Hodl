"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useTx } from "@/components/tx/TxProvider";
import { CheckIcon, ClockIcon, WarnIcon } from "@/components/ui/icons";
import { Countdown, Dialog, EASE } from "@/components/ui/motion";
import { Button, TxLink } from "@/components/ui/primitives";
import { useWallet } from "@/components/wallet/WalletProvider";
import { cn } from "@/lib/cn";
import { amountLabel, formatAmount, formatBalance, formatShort, parseAmount, shortAddress } from "@/lib/format";
import { isClosed, type Phase, type Role } from "@/lib/hodl/phase";
import type { Escrow, EscrowHistory } from "@/lib/hodl/types";
import { useReadiness } from "@/lib/hooks/queries";
import { sc } from "@/lib/stellar/rpc";

type Action = "fund" | "release" | "refund" | "claim_expired";

interface Confirm {
  action: Action;
  title: string;
  body: ReactNode;
  confirm: string;
  cancel: string;
}

/**
 * Shows only what the connected wallet may do. The contract enforces the
 * same rules anyway; this just keeps people from signing a sure failure.
 */
export function ActionPanel({
  escrow,
  phase,
  role,
  history,
}: {
  escrow: Escrow;
  phase: Phase;
  role: Role;
  history: EscrowHistory | undefined;
}) {
  const { address, connect } = useWallet();
  const tx = useTx();
  const readiness = useReadiness(address);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const amount = formatAmount(escrow.amount);
  const label = amountLabel(escrow.amount);
  const to = shortAddress(escrow.recipient);
  const from = shortAddress(escrow.payer);
  const usdc = readiness.data?.usdc ?? null;
  const hasTrustline = usdc !== null;
  const canAfford = usdc !== null && (parseAmount(usdc) ?? 0n) >= BigInt(escrow.amount);

  const run = async (action: Action) => {
    setConfirm(null);
    const copy: Record<Action, [string, string]> = {
      fund: [`Locking ${amount} USDC…`, `Locked. ${amount} USDC is in the contract.`],
      release: [`Releasing ${amount} USDC…`, `Paid. ${amount} USDC sent.`],
      refund: [`Refunding ${amount} USDC…`, `Refunded. ${amount} USDC went back.`],
      claim_expired: [
        escrow.fundedAt ? `Taking back ${amount} USDC…` : "Closing the escrow…",
        escrow.fundedAt ? `Back with you. ${amount} USDC returned.` : "Closed. Nothing was locked.",
      ],
    };
    await tx.invoke(action, [sc.u64(escrow.id)], { pending: copy[action][0], success: copy[action][1], escrowIds: [escrow.id] });
  };

  const ask = {
    release: (): Confirm => ({
      action: "release",
      title: `Release ${amount} USDC?`,
      body: (
        <>
          This pays <span className="font-mono text-paper">{to}</span> and closes the escrow. It can&apos;t be undone.
        </>
      ),
      confirm: `Release ${label} USDC`,
      cancel: "Keep it locked",
    }),
    refund: (): Confirm => ({
      action: "refund",
      title: `Refund ${amount} USDC?`,
      body: (
        <>
          This sends it back to <span className="font-mono text-paper">{from}</span> and closes the escrow. It can&apos;t be
          undone.
        </>
      ),
      confirm: "Refund the payer",
      cancel: "Keep it locked",
    }),
    reclaim: (): Confirm => ({
      action: "claim_expired",
      title: `Take back ${amount} USDC?`,
      body: <>The deadline has passed. This returns the money to you and closes the escrow.</>,
      confirm: `Take back ${label} USDC`,
      cancel: "Not yet",
    }),
  };

  // ------------------------------------------------------------ deadline row
  const closed = isClosed(phase);
  const deadlineRow = closed ? (
    <DeadlineRow left={`Settled ${formatShort(escrow.closedAt)}`} right="Final" color={phaseColor(phase)} />
  ) : phase === "expiredClaimable" || phase === "createdExpired" ? (
    <DeadlineRow left={`Deadline was ${formatShort(escrow.deadline)}`} right="Passed" color="#FF8A7A" />
  ) : (
    <DeadlineRow
      left={phase === "funded" ? `Payer can take it back after ${formatShort(escrow.deadline)}` : `Deadline ${formatShort(escrow.deadline)}`}
      right={<Countdown deadline={escrow.deadline} suffix="" />}
      color="#5BF0B0"
    />
  );

  // ------------------------------------------------------------ the content
  let body: ReactNode;
  let primary: { label: string; onClick: () => void; disabled?: boolean } | null = null;
  const busy = tx.busy;

  const trustlineNote =
    role === "recipient" && !closed ? (
      hasTrustline ? (
        <Note tone="mint" icon={<CheckIcon size={16} />}>
          Your wallet is ready to receive USDC
        </Note>
      ) : readiness.isSuccess ? (
        <Note tone="coral" icon={<WarnIcon size={16} />}>
          Add USDC to your wallet so {amount} can land.{" "}
          <Link href="/setup" className="font-semibold underline underline-offset-2">
            Fix it
          </Link>
        </Note>
      ) : null
    ) : null;

  if (!address && !closed) {
    body = (
      <Block title={<>Is this <em>yours?</em></>}>
        <P>Connect the payer&apos;s or the recipient&apos;s wallet to act on it. Everything here comes straight from the contract.</P>
        <Button variant="paper" size="lg" onClick={() => connect()}>
          Connect wallet
        </Button>
      </Block>
    );
  } else if (closed) {
    const closing = history?.events.find((e) => e.action === phase);
    const words: Record<string, [ReactNode, string]> = {
      released: ["Paid in full.", `${amount} USDC reached ${to}. This escrow is closed for good.`],
      refunded: ["Refunded.", `The recipient sent the ${amount} USDC back to the payer. This escrow is closed.`],
      expired: escrow.fundedAt
        ? ["Back where it started.", `The deadline passed and the payer took the ${amount} USDC back. This escrow is closed.`]
        : ["Closed.", "The deadline passed before anything was locked. Nothing moved."],
    };
    const [title, text] = words[phase];
    body = (
      <Block title={title}>
        <P>{text}</P>
        {closing && (
          <div className="flex min-h-[50px] items-center justify-between gap-2 rounded-2xl border border-white/10 px-4">
            <span className="text-sm text-muted">Final receipt</span>
            <TxLink hash={closing.txHash} />
          </div>
        )}
      </Block>
    );
  } else if (role === "viewer") {
    body = (
      <Block title={<>You&apos;re <em>just looking.</em></>}>
        <P>Only the payer and the recipient can act on this escrow. You&apos;re not a party to it. Everything here comes straight from the contract.</P>
      </Block>
    );
  } else if (role === "payer") {
    if (phase === "created") {
      primary = { label: `Lock ${label} USDC`, onClick: () => run("fund"), disabled: busy || !canAfford };
      body = (
        <Block title={<>Lock it to <em>get started.</em></>}>
          <P>Until you lock the money, the recipient has no guarantee. One signature moves {amount} USDC into the contract.</P>
          <PrimaryButton {...primary} />
          <span className="text-center text-[13px] text-faint">
            {usdc === null ? (
              readiness.isSuccess ? (
                <Link href="/setup" className="text-coral underline underline-offset-2">Add USDC to your wallet first</Link>
              ) : null
            ) : (
              <>
                You have <span className="font-mono text-paper">{formatBalance(usdc)} USDC</span>
                {!canAfford && <span className="text-coral"> · not enough</span>}
              </>
            )}
          </span>
        </Block>
      );
    } else if (phase === "funded") {
      primary = { label: `Release ${label} USDC`, onClick: () => setConfirm(ask.release()), disabled: busy };
      body = (
        <Block title={<>Got what you <em>paid for?</em></>}>
          <P>
            Releasing pays <span className="font-mono text-paper">{to}</span> in seconds and closes the escrow. It can&apos;t be
            undone.
          </P>
          <PrimaryButton {...primary} />
          <P small>Not happy? Do nothing. After the deadline you can take the money back.</P>
        </Block>
      );
    } else if (phase === "expiredClaimable") {
      primary = { label: `Take back ${label} USDC`, onClick: () => setConfirm(ask.reclaim()), disabled: busy };
      body = (
        <Block title={<>The deadline <em>has passed.</em></>}>
          <P>You can take the {amount} USDC back now. If the work did arrive, you can still pay them instead.</P>
          <PrimaryButton {...primary} />
          <Button variant="outline" size="lg" className="rounded-2xl" disabled={busy} onClick={() => setConfirm(ask.release())}>
            Pay them anyway
          </Button>
        </Block>
      );
    } else {
      // createdExpired
      primary = { label: "Close it", onClick: () => run("claim_expired"), disabled: busy };
      body = (
        <Block title={<>Expired <em>before funding.</em></>}>
          <P>The deadline passed before you locked anything. Closing it tidies up your list. Nothing moves.</P>
          <PrimaryButton {...primary} variant="outline" />
        </Block>
      );
    }
  } else {
    // recipient
    if (phase === "created") {
      body = (
        <Block title={<>Not locked <em>yet.</em></>}>
          <P>Hold off on the work until this says Locked. Then the money is guaranteed to be there.</P>
          {trustlineNote}
        </Block>
      );
    } else if (phase === "funded") {
      body = (
        <Block title={<>It&apos;s locked. <em>Go do the work.</em></>}>
          <P>The payer can&apos;t pull it back before the deadline. You&apos;re paid the moment they release.</P>
          {trustlineNote}
          <Button variant="outline" size="lg" className="rounded-2xl" disabled={busy} onClick={() => setConfirm(ask.refund())}>
            Refund the payer
          </Button>
          <P small>Can&apos;t deliver? Refunding sends the money back and closes the escrow.</P>
        </Block>
      );
    } else if (phase === "expiredClaimable") {
      body = (
        <Block title={<>The deadline <em>has passed.</em></>}>
          <P>The payer can now take the money back. They can still choose to pay you.</P>
          {trustlineNote}
          <Button variant="outline" size="lg" className="rounded-2xl" disabled={busy} onClick={() => setConfirm(ask.refund())}>
            Refund the payer
          </Button>
        </Block>
      );
    } else {
      body = (
        <Block title={<>Expired <em>before funding.</em></>}>
          <P>The payer never locked the money, and the deadline has passed. Nothing is owed either way.</P>
        </Block>
      );
    }
  }

  const actionable = primary !== null || (role === "recipient" && (phase === "funded" || phase === "expiredClaimable"));

  return (
    <>
      <section
        aria-label="Next step"
        className={cn(
          "rise d3 relative flex flex-col gap-4 overflow-hidden rounded-[26px] border bg-panel p-6 transition-colors duration-500",
          actionable ? "border-mint/30" : "border-white/[0.07]",
        )}
      >
        {deadlineRow}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${phase}-${role}-${address ?? ""}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Mobile: the one main action stays under your thumb. */}
      {primary && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 bg-gradient-to-b from-night/0 via-night/95 to-night px-4 pt-6 pb-[max(1.6rem,env(safe-area-inset-bottom))] md:hidden">
          <Button size="xl" className="rounded-[18px] text-[17px]" onClick={primary.onClick} disabled={primary.disabled}>
            {primary.label}
          </Button>
          <span className="text-center text-xs text-faint">
            {phase === "funded" ? `Pays ${to} now. Can't be undone.` : phase === "created" ? "Moves it into the contract." : "Returns it to you."}
          </span>
        </div>
      )}

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title}>
        <p className="text-sm leading-[1.55] text-muted">{confirm?.body}</p>
        <div className="mt-1 flex flex-col gap-2">
          <Button size="md" onClick={() => confirm && run(confirm.action)}>
            {confirm?.confirm}
          </Button>
          <Button variant="outline" size="sm" className="rounded-[13px]" onClick={() => setConfirm(null)}>
            {confirm?.cancel}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

const phaseColor = (p: Phase) => (p === "released" ? "#7CC4FF" : p === "refunded" ? "#C3A6FF" : "#FF8A7A");

function DeadlineRow({ left, right, color }: { left: string; right: ReactNode; color: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-white/[0.03] px-3.5 py-3">
      <span className="inline-flex items-center gap-2 text-[13px] text-muted">
        <ClockIcon size={15} />
        {left}
      </span>
      <span className="font-mono text-[13px] font-semibold tabular" style={{ color }}>
        {right}
      </span>
    </div>
  );
}

function Block({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="font-serif text-[30px] leading-[1.05] font-normal">{title}</h2>
      {children}
    </div>
  );
}

function P({ children, small }: { children: ReactNode; small?: boolean }) {
  return <p className={cn("leading-[1.55]", small ? "text-[13px] text-faint" : "text-[15px] text-muted")}>{children}</p>;
}

function PrimaryButton({
  label,
  onClick,
  disabled,
  variant = "mint",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "mint" | "outline";
}) {
  // On phones the sticky bar carries the main action.
  return (
    <Button variant={variant} size="xl" className="hidden md:inline-flex" onClick={onClick} disabled={disabled}>
      {label}
    </Button>
  );
}

function Note({ tone, icon, children }: { tone: "mint" | "coral"; icon: ReactNode; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 rounded-[14px] px-3.5 py-3 text-sm",
        tone === "mint" ? "bg-mint/[0.08] text-mint" : "bg-coral/[0.08] text-coral",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span>{children}</span>
    </span>
  );
}
