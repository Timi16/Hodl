"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { TxLink } from "@/components/ui/primitives";
import { CheckIcon, CloseIcon, WarnIcon } from "@/components/ui/icons";
import { useWallet } from "@/components/wallet/WalletProvider";
import { cn } from "@/lib/cn";
import { toHodlError } from "@/lib/hodl/errors";
import { keys } from "@/lib/hooks/queries";
import { addUsdcTrustline, invokeHodl, type TxResult, type TxStage } from "@/lib/stellar/tx";
import type { xdr } from "@stellar/stellar-sdk";

const STEPS: { stage: TxStage; label: string }[] = [
  { stage: "simulating", label: "Checking" },
  { stage: "signing", label: "Sign in wallet" },
  { stage: "submitting", label: "Submitting" },
  { stage: "confirming", label: "Confirming" },
];

const HINT: Record<TxStage, string> = {
  simulating: "Checking it with the contract first. Nothing is signed yet.",
  signing: "Approve it in your wallet.",
  submitting: "Sending it to Stellar.",
  confirming: "Confirming on Stellar. Usually a few seconds.",
};

type Toast =
  | { kind: "pending"; id: number; title: string; stage: TxStage }
  | { kind: "success"; id: number; title: string; hash: string }
  | { kind: "error"; id: number; title: string; message: string; hash?: string };

interface RunOptions {
  /** "Releasing 250.00 USDC…" */
  pending: string;
  /** "Paid. 250.00 USDC sent." */
  success: string;
  /** Escrow ids whose cached reads should refresh afterwards. */
  escrowIds?: number[];
}

interface TxContext {
  busy: boolean;
  stage: TxStage | null;
  invoke: (method: string, args: xdr.ScVal[], opts: RunOptions) => Promise<TxResult | null>;
  trustline: (opts: RunOptions) => Promise<TxResult | null>;
}

const Ctx = createContext<TxContext | null>(null);

export function TxProvider({ children }: { children: React.ReactNode }) {
  const { address, sign } = useWallet();
  const qc = useQueryClient();
  const [toast, setToast] = useState<Toast | null>(null);
  const [stage, setStage] = useState<TxStage | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = useCallback(
    async (exec: (onStage: (s: TxStage) => void) => Promise<TxResult>, opts: RunOptions) => {
      if (!address) {
        setToast({ kind: "error", id: ++seq.current, title: "Connect a wallet", message: "Connect a wallet to sign this." });
        return null;
      }
      clearTimeout(timer.current);
      const id = ++seq.current;
      const onStage = (s: TxStage) => {
        setStage(s);
        setToast({ kind: "pending", id, title: opts.pending, stage: s });
      };
      try {
        const result = await exec(onStage);
        setToast({ kind: "success", id, title: opts.success, hash: result.hash });
        timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 9000);
        return result;
      } catch (err) {
        const e = toHodlError(err);
        setToast({ kind: "error", id, title: e.title, message: e.message, hash: (err as { hash?: string }).hash });
        return null;
      } finally {
        setStage(null);
        // Refresh everything this write can have changed.
        for (const escrowId of opts.escrowIds ?? []) {
          qc.invalidateQueries({ queryKey: keys.escrow(escrowId) });
          qc.invalidateQueries({ queryKey: keys.history(escrowId) });
        }
        qc.invalidateQueries({ queryKey: ["user"] });
        qc.invalidateQueries({ queryKey: ["activity"] });
        qc.invalidateQueries({ queryKey: ["readiness"] });
      }
    },
    [address, qc],
  );

  const value = useMemo<TxContext>(
    () => ({
      busy: stage !== null,
      stage,
      invoke: (method, args, opts) =>
        run((onStage) => invokeHodl(method, args, { source: address!, sign, onStage }), opts),
      trustline: (opts) => run((onStage) => addUsdcTrustline({ source: address!, sign, onStage }), opts),
    }),
    [run, stage, address, sign],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <TxToast toast={toast} onClose={() => setToast(null)} />
    </Ctx.Provider>
  );
}

export function useTx(): TxContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTx must be used inside <TxProvider>");
  return ctx;
}

function TxToast({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-end sm:p-6">
      <AnimatePresence mode="popLayout">
        {toast && (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            role={toast.kind === "error" ? "alert" : "status"}
            aria-live="polite"
            className={cn(
              "pointer-events-auto relative w-full max-w-[400px] rounded-[18px] border p-4 pr-11 shadow-[0_20px_60px_rgb(0_0_0/0.5)] backdrop-blur-xl",
              toast.kind === "pending" && "border-white/[0.08] bg-panel-2/95",
              toast.kind === "success" && "border-mint/30 bg-[#0d1712]/95",
              toast.kind === "error" && "border-coral/30 bg-[#1a100e]/95",
            )}
          >
            {toast.kind !== "pending" && (
              <button
                type="button"
                aria-label="Dismiss"
                onClick={onClose}
                className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-lg text-faint hover:text-paper"
              >
                <CloseIcon size={15} />
              </button>
            )}
            {toast.kind === "pending" && <PendingBody title={toast.title} stage={toast.stage} />}
            {toast.kind === "success" && (
              <div className="flex items-start gap-3">
                <motion.span
                  initial={{ scale: 0.4, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                  className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-mint text-night"
                >
                  <CheckIcon size={16} strokeWidth={2.75} />
                </motion.span>
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{toast.title}</span>
                  <span className="flex items-center gap-2 text-[13px] text-muted">
                    Receipt <TxLink hash={toast.hash} />
                  </span>
                </span>
              </div>
            )}
            {toast.kind === "error" && (
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-coral/[0.14] text-coral">
                  <WarnIcon size={18} />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{toast.title}</span>
                  <span className="text-[13px] leading-normal text-muted">{toast.message}</span>
                  {toast.hash && (
                    <span className="mt-1">
                      <TxLink hash={toast.hash} />
                    </span>
                  )}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PendingBody({ title, stage }: { title: string; stage: TxStage }) {
  const current = STEPS.findIndex((s) => s.stage === stage);
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-semibold">{title}</span>
      <span className="relative h-1 overflow-hidden rounded-sm bg-white/[0.06]">
        <span className="load absolute inset-y-0 w-2/5 rounded-sm bg-mint" />
      </span>
      <ol className="grid grid-cols-4 gap-1.5" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.stage} className="flex flex-col gap-1.5">
            <motion.span
              className="h-[3px] rounded-full"
              initial={false}
              animate={{ backgroundColor: i < current ? "#EDEFEA" : i === current ? "#5BF0B0" : "rgba(255,255,255,0.1)" }}
            />
            <span className={cn("text-[11px]", i === current ? "text-paper" : "text-faint")}>{s.label}</span>
          </li>
        ))}
      </ol>
      <span className="text-[13px] text-muted">{HINT[stage]}</span>
    </div>
  );
}
