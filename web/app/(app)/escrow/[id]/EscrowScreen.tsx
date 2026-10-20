"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ActionPanel } from "@/components/escrow/ActionPanel";
import { EscrowStage, Receipts } from "@/components/escrow/EscrowStage";
import { ExternalIcon, LinkIcon, ShieldIcon, WarnIcon } from "@/components/ui/icons";
import { ButtonLink, Panel, Skeleton } from "@/components/ui/primitives";
import { useWallet } from "@/components/wallet/WalletProvider";
import { cn } from "@/lib/cn";
import { config, explorer } from "@/lib/config";
import { phaseOf, roleOf } from "@/lib/hodl/phase";
import { useEscrow, useEscrowHistory } from "@/lib/hooks/queries";
import { useNow } from "@/lib/hooks/useNow";

export function EscrowScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = use(params);
  const id = /^\d{1,15}$/.test(raw) ? Number(raw) : null;
  const { address } = useWallet();
  const now = useNow(1000);
  const escrow = useEscrow(id);
  const history = useEscrowHistory(escrow.data);

  if (id === null || escrow.data === null) return <Missing id={raw} />;
  if (escrow.isError && !escrow.data) return <Failed onRetry={() => escrow.refetch()} />;
  if (!escrow.data || now === null) return <EscrowSkeleton />;

  const e = escrow.data;
  const phase = phaseOf(e, now / 1000);
  const role = roleOf(e, address);

  return (
    <main className="relative mx-auto flex max-w-[1160px] flex-col gap-5 px-[clamp(16px,3vw,32px)] pt-4 pb-44 md:pb-20">
      <div className="rise d1 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-faint">
          <Link href="/dashboard" className="text-muted hover:text-paper">
            Overview
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-mono text-paper" aria-current="page">
            Escrow #{e.id}
          </span>
        </nav>
        <div className="flex flex-wrap gap-2">
          <ShareButton title={e.title} />
          <a
            href={explorer.contract()}
            target="_blank"
            rel="noreferrer"
            className="btn inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm font-medium"
          >
            View on Stellar Expert <ExternalIcon size={13} />
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
          <EscrowStage escrow={e} phase={phase} role={role} />
          {e.terms && (
            <section
              aria-labelledby="terms"
              className="rise d3 flex flex-col gap-2.5 rounded-[24px] border border-white/[0.07] bg-panel px-[26px] py-6"
            >
              <h2 id="terms" className="eyebrow">
                What you agreed
              </h2>
              <p className="font-serif text-2xl leading-[1.35] break-words whitespace-pre-line">{e.terms}</p>
              <span className="text-[13px] text-faint">Saved with the escrow. Neither side can edit it.</span>
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <ActionPanel escrow={e} phase={phase} role={role} history={history.data} />
          <Receipts escrow={e} role={role} phase={phase} history={history.data} loading={history.isLoading} />
          <section
            aria-label="Where the money is"
            className="rise d5 flex items-start gap-3.5 rounded-[22px] border border-mint/[0.18] bg-mint/5 px-[22px] py-5"
          >
            <ShieldIcon size={22} className="shrink-0 text-mint" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Held by the contract, not HodL</span>
              <span className="text-[13px] leading-normal text-muted">
                Stellar Testnet · USDC · Escrow ID <span className="font-mono">{e.id}</span> ·{" "}
                <a href={explorer.contract()} target="_blank" rel="noreferrer" className="font-mono text-mint hover:text-mint-hover">
                  {config.contractId.slice(0, 4)}…{config.contractId.slice(-4)}
                </a>
              </span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const url = window.location.href;
        if (navigator.share && /Mobi/i.test(navigator.userAgent)) {
          await navigator.share({ title: `HodL · ${title}`, url }).catch(() => {});
          return;
        }
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className={cn(
        "btn inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium",
        copied ? "border-mint/40 bg-mint/10 text-mint" : "border-white/[0.08] bg-white/[0.03]",
      )}
    >
      <LinkIcon size={15} />
      {copied ? "Link copied" : "Share link"}
    </button>
  );
}

export function EscrowSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading escrow"
      className="mx-auto flex max-w-[1160px] flex-col gap-5 px-[clamp(16px,3vw,32px)] pt-4 pb-20"
    >
      <Skeleton className="h-11 w-56" />
      <div className="flex flex-wrap gap-5">
        <Skeleton className="h-[560px] min-w-0 flex-[999_1_600px] rounded-[32px]" />
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <Skeleton className="h-[300px] rounded-[26px]" />
          <Skeleton className="h-[220px] rounded-[26px]" />
        </div>
      </div>
    </main>
  );
}

function Missing({ id }: { id: string }) {
  return (
    <main className="mx-auto flex max-w-[640px] flex-col items-center gap-5 px-4 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.04] text-muted">
        <WarnIcon size={26} />
      </span>
      <h1 className="font-serif text-[44px] leading-none">
        No escrow <em className="text-faint">#{id}</em>
      </h1>
      <p className="text-muted">
        Nothing with that id exists on this contract. Check the link, or the network: links from before a Testnet reset
        stop working.
      </p>
      <ButtonLink href="/dashboard" variant="ghost">
        Back to overview
      </ButtonLink>
    </main>
  );
}

function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="mx-auto max-w-[640px] px-4 py-24">
      <Panel className="flex flex-col items-start gap-4 border-coral/30 p-7" role="alert">
        <WarnIcon size={24} className="text-coral" />
        <h1 className="font-serif text-3xl">Couldn&apos;t reach Stellar</h1>
        <p className="text-muted">The public Testnet RPC didn&apos;t answer. Your money is unaffected; this is only the view.</p>
        <button type="button" onClick={onRetry} className="btn min-h-11 rounded-xl border border-white/10 px-4 text-sm font-medium">
          Try again
        </button>
      </Panel>
    </main>
  );
}
