"use client";

import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { useTx } from "@/components/tx/TxProvider";
import { CheckIcon, ExternalIcon, WarnIcon } from "@/components/ui/icons";
import { EASE } from "@/components/ui/motion";
import { Button, ButtonLink, Glow } from "@/components/ui/primitives";
import { useWallet } from "@/components/wallet/WalletProvider";
import { cn } from "@/lib/cn";
import { config } from "@/lib/config";
import { formatBalance, shortAddress } from "@/lib/format";
import { keys, useReadiness } from "@/lib/hooks/queries";

type State = "done" | "current" | "locked";

export function SetupScreen() {
  const { address, connect, connecting, onTestnet } = useWallet();
  const readiness = useReadiness(address);
  const tx = useTx();
  const qc = useQueryClient();
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);

  const r = readiness.data;
  const connected = !!address && onTestnet !== false;
  const hasXlm = !!r?.exists;
  const hasTrustline = r?.usdc !== null && r?.usdc !== undefined;
  const hasUsdc = hasTrustline && Number(r!.usdc) > 0;
  const checks = [connected, hasXlm, hasTrustline, hasUsdc];
  const done = checks.filter(Boolean).length;
  const firstOpen = checks.findIndex((c) => !c);
  const state = (i: number): State => (checks[i] ? "done" : i === firstOpen ? "current" : "locked");

  const fund = async () => {
    setFunding(true);
    setFundError(null);
    try {
      const res = await fetch("/api/friendbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: { message?: string } }).error?.message ?? "Friendbot failed");
      await qc.invalidateQueries({ queryKey: keys.readiness(address!) });
    } catch (e) {
      setFundError(e instanceof Error ? e.message : "Friendbot failed");
    } finally {
      setFunding(false);
    }
  };

  const next = ["Connect a Stellar wallet on Testnet.", "Fund it with free test XLM.", "Let your wallet hold USDC.", "Get free test USDC."][firstOpen];
  const progressText =
    done === 4 ? "All set." : done === 0 ? "Let's start." : done >= 2 ? "Halfway there." : "Good start.";

  return (
    <main className="relative mx-auto flex max-w-[1160px] flex-wrap items-start gap-10 px-[clamp(16px,3vw,32px)] pt-8 pb-20">
      <Glow drift className="top-20 -left-[120px] h-[480px] w-[520px]" color="rgb(91 240 176 / 0.09)" />

      <div className="relative flex min-w-0 flex-[1_1_340px] flex-col gap-6 lg:sticky lg:top-6">
        <div className="rise d1 flex flex-col gap-3.5">
          <span className="eyebrow text-xs">Wallet setup</span>
          <h1 className="font-serif text-[clamp(38px,4.2vw,54px)] leading-none font-normal tracking-[-0.02em]">
            Two minutes <em className="text-mint">to ready.</em>
          </h1>
          <p className="text-base leading-relaxed text-muted">
            Four quick checks before you can lock or receive USDC. We run them for you and fix what we can.
          </p>
        </div>
        <div className="rise d2 flex items-center gap-[18px]">
          <ProgressRing done={done} />
          <span className="text-[15px] leading-normal text-muted">
            {progressText}
            {firstOpen >= 0 && (
              <>
                <br />
                Next: {next?.charAt(0).toLowerCase()}
                {next?.slice(1)}
              </>
            )}
          </span>
        </div>
        <div className="rise d3 flex flex-col gap-2 rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-[22px] py-5">
          <span className="font-serif text-[22px]">Why the extra step?</span>
          <span className="text-sm leading-relaxed text-muted">
            On Stellar, a wallet has to say yes to a token before it can hold it. It&apos;s a one-time signature, and it stops
            random tokens landing in your account.
          </span>
        </div>
      </div>

      <ol className="relative flex min-w-0 flex-[1.4_1_520px] flex-col gap-3">
        <Step
          n={1}
          state={state(0)}
          title="Wallet connected"
          detail={
            address ? (
              onTestnet === false ? (
                <span className="text-coral">Your wallet is on another network. Switch it to Testnet, then reconnect.</span>
              ) : (
                <>
                  On Testnet · <span className="font-mono">{shortAddress(address)}</span>
                </>
              )
            ) : (
              "Freighter, xBull, Lobstr, Albedo or Hana. Set it to Testnet."
            )
          }
          action={
            !address && (
              <Button size="lg" className="w-full" onClick={() => connect()} disabled={connecting}>
                {connecting ? "Connecting…" : "Connect wallet"}
              </Button>
            )
          }
        />
        <Step
          n={2}
          state={state(1)}
          title="XLM for network fees"
          detail={
            hasXlm ? (
              <>
                <span className="font-mono">{formatBalance(r!.xlm!)} XLM</span>. Plenty for thousands of escrows.
              </>
            ) : (
              "Friendbot sends 10,000 free test XLM. It's what pays Stellar's tiny fees."
            )
          }
          action={
            state(1) === "current" && (
              <>
                <Button size="lg" className="w-full" onClick={fund} disabled={funding}>
                  {funding ? "Asking Friendbot…" : "Fund with Friendbot"}
                </Button>
                {fundError && (
                  <span className="flex items-center gap-2 text-[13px] text-coral" role="alert">
                    <WarnIcon size={14} />
                    {fundError}
                  </span>
                )}
              </>
            )
          }
        />
        <Step
          n={3}
          state={state(2)}
          title="Let your wallet hold USDC"
          detail={
            hasTrustline ? "USDC trustline added. Your wallet can hold USDC." : "One signature adds a USDC trustline. You only do this once."
          }
          action={
            state(2) === "current" && (
              <Button
                size="lg"
                className="w-full"
                disabled={tx.busy}
                onClick={() => tx.trustline({ pending: "Adding USDC to your wallet…", success: "Done. Your wallet can hold USDC." })}
              >
                Add USDC to my wallet
              </Button>
            )
          }
        />
        <Step
          n={4}
          state={state(3)}
          title="Get free test USDC"
          detail={
            hasUsdc ? (
              <>
                <span className="font-mono">{formatBalance(r!.usdc!)} USDC</span> ready to lock.
              </>
            ) : state(3) === "locked" ? (
              "From Circle's faucet. Unlocks after step 3."
            ) : (
              <>
                Pick <span className="text-paper">Stellar Testnet</span> on Circle&apos;s faucet and paste your address. This page
                updates by itself.
              </>
            )
          }
          action={
            !hasUsdc && (
              <a
                href={config.usdcFaucetUrl}
                target="_blank"
                rel="noreferrer"
                aria-disabled={state(3) === "locked"}
                className={cn(
                  "btn inline-flex min-h-11 items-center gap-1.5 self-start rounded-xl border px-4 text-sm font-medium",
                  state(3) === "locked" ? "pointer-events-none border-white/[0.08] text-faint" : "border-mint/40 bg-mint/10 text-mint",
                )}
              >
                Open faucet <ExternalIcon size={13} />
              </a>
            )
          }
        />
        <li className="rise d5 flex flex-wrap items-center justify-between gap-3 px-1 pt-2">
          <span className="text-[13px] text-faint">Testnet only. These tokens have no real value.</span>
          {done === 4 ? (
            <ButtonLink href="/escrow/new" size="md">
              Start your first escrow
            </ButtonLink>
          ) : (
            <span className="inline-flex min-h-12 items-center rounded-[13px] bg-white/[0.04] px-[18px] text-sm font-semibold text-faint" aria-disabled="true">
              Start your first escrow
            </span>
          )}
        </li>
      </ol>
    </main>
  );
}

function ProgressRing({ done }: { done: number }) {
  const C = 2 * Math.PI * 48;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={done} aria-label={`${done} of 4 checks done`} className="relative size-28">
      <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true" className="-rotate-90">
        <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
        <motion.circle
          cx="56"
          cy="56"
          r="48"
          fill="none"
          stroke="#5BF0B0"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - done / 4) }}
          transition={{ duration: 1.4, ease: EASE, delay: 0.3 }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-serif text-[34px]">
        {done}
        <span className="text-[22px] text-faint">/4</span>
      </span>
    </div>
  );
}

function Step({
  n,
  state,
  title,
  detail,
  action,
}: {
  n: number;
  state: State;
  title: string;
  detail: ReactNode;
  action?: ReactNode;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.1 * n }}
      className={cn(
        "relative flex flex-col gap-4 overflow-hidden rounded-[22px] border p-5 sm:px-[22px]",
        state === "done" && "border-white/[0.07] bg-panel",
        state === "current" && "border-mint/40 bg-panel p-6 shadow-[0_0_0_6px_rgb(91_240_176/0.04)]",
        state === "locked" && "border-dashed border-white/10 bg-transparent",
      )}
    >
      {state === "current" && <Glow className="-top-[60px] -right-[60px] h-[240px] w-[240px] blur-[50px]" color="rgb(91 240 176 / 0.14)" />}
      <div className="relative flex items-center gap-4">
        <motion.span
          layout
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-semibold",
            state === "done" && "bg-mint/[0.14] text-mint",
            state === "current" && "border border-mint text-mint",
            state === "locked" && "border border-white/[0.12] font-normal text-faint",
          )}
        >
          {state === "done" ? (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
              <CheckIcon size={18} strokeWidth={2.75} label="Done" />
            </motion.span>
          ) : (
            n
          )}
        </motion.span>
        <div className="flex min-w-0 grow flex-col gap-[3px]">
          <span className={cn("font-semibold", state === "locked" && "text-muted")}>{title}</span>
          <span className={cn("text-sm", state === "locked" ? "text-faint" : "text-muted")}>{detail}</span>
        </div>
      </div>
      {action && <div className="relative flex flex-col gap-2">{action}</div>}
    </motion.li>
  );
}
