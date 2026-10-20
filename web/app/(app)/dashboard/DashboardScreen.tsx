"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { EscrowRow } from "@/components/escrow/EscrowRow";
import { LockSoftIcon, PlusIcon, WarnIcon } from "@/components/ui/icons";
import { AnimatedAmount, EASE, SegmentTabs } from "@/components/ui/motion";
import { ButtonLink, Button, Dot, Glow, Panel, Skeleton } from "@/components/ui/primitives";
import { VaultRing } from "@/components/ui/VaultRing";
import { LockIcon } from "@/components/ui/icons";
import { useWallet } from "@/components/wallet/WalletProvider";
import { amountLabel, formatAmount } from "@/lib/format";
import { isClosed, phaseOf, roleOf } from "@/lib/hodl/phase";
import type { Escrow } from "@/lib/hodl/types";
import { useReadiness, useUserEscrows } from "@/lib/hooks/queries";
import { useNow } from "@/lib/hooks/useNow";

type Filter = "all" | "paying" | "receiving" | "settled";

export function DashboardScreen() {
  const { address, ready, connect } = useWallet();
  const now = useNow(15_000);
  const data = useUserEscrows(address);
  const readiness = useReadiness(address);
  const [filter, setFilter] = useState<Filter>("all");

  const view = useMemo(() => {
    if (!data.data || !address || now === null) return null;
    const nowSec = now / 1000;
    const rows = data.data.escrows.map((e) => ({ e, phase: phaseOf(e, nowSec), role: roleOf(e, address) }));
    const sum = (list: typeof rows) => list.reduce((t, r) => t + BigInt(r.e.amount), 0n);
    const lockedPaying = rows.filter((r) => r.role === "payer" && (r.phase === "funded" || r.phase === "expiredClaimable"));
    const lockedReceiving = rows.filter((r) => r.role === "recipient" && r.phase === "funded");
    const settled = rows.filter((r) => isClosed(r.phase));
    const noTrustline = readiness.data && readiness.data.usdc === null;

    type Todo = { e: Escrow; icon: "lock" | "warn"; tone: "mint" | "coral"; text: string; cta: string; href: string; solid: boolean };
    const todos: Todo[] = [];
    for (const r of rows) {
      if (r.role === "payer" && r.phase === "created")
        todos.push({ e: r.e, icon: "lock", tone: "mint", text: "Not funded yet. Lock it so they can start.", cta: `Lock ${amountLabel(r.e.amount)} USDC`, href: `/escrow/${r.e.id}`, solid: true });
      if (r.role === "payer" && r.phase === "expiredClaimable")
        todos.push({ e: r.e, icon: "warn", tone: "coral", text: "Deadline passed. You can take it back, or pay anyway.", cta: "Decide", href: `/escrow/${r.e.id}`, solid: true });
      if (r.role === "recipient" && r.phase === "funded" && noTrustline)
        todos.push({ e: r.e, icon: "warn", tone: "coral", text: `Add USDC to your wallet so ${formatAmount(r.e.amount)} can land.`, cta: "Fix it", href: "/setup", solid: false });
    }

    const lists: Record<Filter, typeof rows> = {
      all: rows,
      paying: rows.filter((r) => r.role === "payer"),
      receiving: rows.filter((r) => r.role === "recipient"),
      settled,
    };
    return {
      lists,
      todos,
      locked: sum(lockedPaying),
      lockedCount: lockedPaying.length,
      coming: sum(lockedReceiving),
      settledCount: settled.length,
    };
  }, [data.data, address, now, readiness.data]);

  if (ready && !address) return <ConnectPrompt onConnect={() => connect()} />;

  return (
    <main className="relative mx-auto flex max-w-[1160px] flex-col gap-5 px-[clamp(16px,3vw,32px)] pt-6 pb-20">
      <div className="rise d1 flex flex-wrap items-end justify-between gap-4 pt-2 pb-1">
        <div className="flex flex-col gap-2">
          <span className="eyebrow text-xs">Overview</span>
          <h1 className="font-serif text-[clamp(36px,4vw,50px)] leading-none font-normal tracking-[-0.02em]">
            Your escrows, <em className="text-faint">at a glance.</em>
          </h1>
        </div>
        <ButtonLink href="/escrow/new" size="md">
          <PlusIcon size={16} />
          Start an escrow
        </ButtonLink>
      </div>

      {!view ? (
        data.isError ? (
          <Panel className="flex items-center justify-between gap-4 p-6" role="alert">
            <span className="text-muted">Couldn&apos;t load your escrows from Stellar.</span>
            <Button variant="outline" size="sm" onClick={() => data.refetch()}>
              Try again
            </Button>
          </Panel>
        ) : (
          <>
            <Skeleton className="h-[300px] rounded-[30px]" />
            <Skeleton className="h-[420px] rounded-[26px]" />
          </>
        )
      ) : (
        <>
          <section
            aria-label="Summary"
            className="rise d2 relative flex flex-wrap items-center justify-between gap-7 overflow-hidden rounded-[30px] border border-white/[0.07] bg-panel p-[clamp(24px,3vw,36px)]"
          >
            <Glow className="-bottom-[160px] -left-[100px] h-[360px] w-[420px]" color="rgb(91 240 176 / 0.10)" />
            <div className="relative flex min-w-0 flex-[1_1_460px] flex-col gap-[18px]">
              <span className="eyebrow text-xs">Locked right now</span>
              <div className="flex items-baseline gap-3">
                <span className="font-serif text-[clamp(56px,6vw,80px)] leading-[0.9] tracking-[-0.03em] tabular">
                  <AnimatedAmount raw={view.locked} countUp />
                </span>
                <span className="font-mono text-[15px] text-muted">USDC</span>
              </div>
              <p className="text-[15px] leading-[1.55] text-muted">
                {view.lockedCount === 0
                  ? "Nothing of yours is locked right now."
                  : `Held across ${view.lockedCount} escrow${view.lockedCount === 1 ? "" : "s"} you're paying.`}{" "}
                {view.coming > 0n && (
                  <>
                    Another <span className="text-paper">{formatAmount(view.coming)} USDC</span> is waiting for you.
                  </>
                )}
              </p>
              <div className="flex flex-wrap border-t border-white/[0.07] pt-[18px]">
                <Stat label="Coming to you" value={formatAmount(view.coming)} />
                <Stat label="Needs you" value={String(view.todos.length)} color={view.todos.length ? "#FF8A7A" : undefined} border />
                <Stat label="Settled" value={String(view.settledCount)} border />
              </div>
            </div>
            <VaultRing className="relative mx-auto w-[220px] shrink-0">
              <span className="glow flex size-16 items-center justify-center rounded-[20px] bg-mint">
                <LockIcon size={30} color="#060807" stroke="#060807" body="#060807" />
              </span>
            </VaultRing>
          </section>

          <AnimatePresence initial={false}>
            {view.todos.length > 0 && (
              <motion.section
                aria-labelledby="needs"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="rise d3 flex flex-col gap-3"
              >
                <h2 id="needs" className="flex items-center gap-2.5 text-[15px] font-semibold">
                  <Dot color="#FF8A7A" pulse size={8} />
                  Waiting on you
                </h2>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-3">
                  {view.todos.map((t) => (
                    <div
                      key={`${t.e.id}-${t.cta}`}
                      className="lift flex flex-wrap items-center gap-3.5 rounded-[20px] border bg-panel px-5 py-[18px]"
                      style={{ borderColor: t.tone === "mint" ? "rgb(91 240 176 / 0.22)" : "rgb(255 138 122 / 0.25)" }}
                    >
                      <span
                        className="flex size-11 shrink-0 items-center justify-center rounded-[14px]"
                        style={{
                          background: t.tone === "mint" ? "rgb(91 240 176 / 0.12)" : "rgb(255 138 122 / 0.12)",
                          color: t.tone === "mint" ? "#5BF0B0" : "#FF8A7A",
                        }}
                      >
                        {t.icon === "lock" ? <LockSoftIcon size={22} /> : <WarnIcon size={22} />}
                      </span>
                      <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-[3px]">
                        <span className="truncate font-semibold">{t.e.title || `Escrow #${t.e.id}`}</span>
                        <span className="text-sm text-muted">{t.text}</span>
                      </div>
                      <ButtonLink href={t.href} variant={t.solid ? "mint" : "outline"} size="sm" className={t.solid ? "" : "font-semibold"}>
                        {t.cta}
                      </ButtonLink>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <section aria-labelledby="all" className="rise d4 overflow-hidden rounded-[26px] border border-white/[0.07] bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] py-[18px]">
              <h2 id="all" className="font-serif text-[26px] font-normal">
                All escrows
              </h2>
              <SegmentTabs
                label="Filter"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: `All · ${view.lists.all.length}` },
                  { value: "paying", label: `Paying · ${view.lists.paying.length}` },
                  { value: "receiving", label: `Receiving · ${view.lists.receiving.length}` },
                  { value: "settled", label: `Settled · ${view.lists.settled.length}` },
                ]}
              />
            </div>
            {view.lists[filter].length === 0 ? (
              <Empty filter={filter} />
            ) : (
              <motion.div layout>
                <AnimatePresence initial={false} mode="popLayout">
                  {view.lists[filter].map(({ e }) => (
                    <motion.div
                      key={e.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25, ease: EASE }}
                    >
                      <EscrowRow escrow={e} me={address!} now={now!} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </section>

          <p className="text-center text-[13px] text-faint">
            Every transaction you made through HodL is in{" "}
            <Link href="/activity" className="text-muted underline underline-offset-2 hover:text-paper">
              your activity
            </Link>
            .
          </p>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, color, border }: { label: string; value: string; color?: string; border?: boolean }) {
  return (
    <div className={`flex flex-[1_1_120px] flex-col gap-1 ${border ? "border-l border-white/[0.07] px-4" : "pr-4"}`}>
      <span className="text-xs text-faint">{label}</span>
      <span className="font-serif text-[28px] tabular" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function Empty({ filter }: { filter: Filter }) {
  const copy: Record<Filter, ReactNode> = {
    all: "No escrows yet. Start one and share the link with whoever you're paying.",
    paying: "You aren't paying anyone through HodL yet.",
    receiving: "Nobody is paying you through HodL yet. Share your address with a client to get started.",
    settled: "Nothing settled yet. Finished escrows land here.",
  };
  return (
    <div className="flex flex-col items-center gap-4 border-t border-white/[0.06] px-6 py-14 text-center">
      <VaultRing className="w-[120px]" inner={false}>
        <LockSoftIcon size={26} className="text-mint" />
      </VaultRing>
      <p className="max-w-[360px] text-[15px] text-muted">{copy[filter]}</p>
      {filter !== "settled" && (
        <ButtonLink href="/escrow/new" variant="ghost" size="sm">
          Start an escrow
        </ButtonLink>
      )}
    </div>
  );
}

function ConnectPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <main className="relative mx-auto flex max-w-[1160px] flex-col items-center gap-7 px-4 py-16 text-center md:py-24">
      <VaultRing className="rise d1 w-[min(260px,70vw)]">
        <span className="glow flex size-16 items-center justify-center rounded-[20px] bg-mint">
          <LockIcon size={30} color="#060807" stroke="#060807" body="#060807" />
        </span>
      </VaultRing>
      <div className="rise d2 flex max-w-[520px] flex-col gap-3">
        <h1 className="font-serif text-[clamp(38px,4.4vw,56px)] leading-none tracking-[-0.02em]">
          Connect to see <em className="text-mint">your escrows.</em>
        </h1>
        <p className="text-base leading-relaxed text-muted">
          HodL reads everything straight from the contract, so all it needs is your public address. You sign in your own
          wallet; we never see your keys.
        </p>
      </div>
      <div className="rise d3 flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={onConnect}>
          Connect wallet
        </Button>
        <ButtonLink href="/setup" variant="ghost" size="lg">
          New to Stellar?
        </ButtonLink>
      </div>
    </main>
  );
}
