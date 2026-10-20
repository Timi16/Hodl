"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { StrKey } from "@stellar/stellar-sdk";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useTx } from "@/components/tx/TxProvider";
import { CheckIcon, LockIcon, ShieldPlainIcon, WarnIcon } from "@/components/ui/icons";
import { AnimatedAmount, EASE } from "@/components/ui/motion";
import { Button, Glow } from "@/components/ui/primitives";
import { VaultRing } from "@/components/ui/VaultRing";
import { useWallet } from "@/components/wallet/WalletProvider";
import { cn } from "@/lib/cn";
import { config } from "@/lib/config";
import { amountLabel, formatAmount, formatBalance, formatLong, formatShort, parseAmount, shortAddress } from "@/lib/format";
import { MAX_TERMS_BYTES, MAX_TITLE_BYTES } from "@/lib/hodl/limits";
import { useReadiness } from "@/lib/hooks/queries";
import { useNow } from "@/lib/hooks/useNow";
import { getReadiness } from "@/lib/stellar/horizon";
import { sc } from "@/lib/stellar/rpc";

const bytes = (s: string) => new TextEncoder().encode(s).length;
const DAY = 86_400;
const PRESETS = [
  { key: "1d", label: "1 day", seconds: DAY },
  { key: "3d", label: "3 days", seconds: 3 * DAY },
  { key: "7d", label: "7 days", seconds: 7 * DAY },
  { key: "30d", label: "30 days", seconds: 30 * DAY },
  { key: "custom", label: "Pick a date", seconds: 0 },
] as const;
type PresetKey = (typeof PRESETS)[number]["key"];

const schema = z
  .object({
    amount: z.string().refine((v) => (parseAmount(v) ?? 0n) > 0n, "Enter an amount greater than zero, up to 7 decimals."),
    recipient: z
      .string()
      .trim()
      .refine((v) => StrKey.isValidEd25519PublicKey(v), "That isn't a Stellar address. It starts with G and is 56 characters."),
    preset: z.enum(["1d", "3d", "7d", "30d", "custom"]),
    customDate: z.string(),
    title: z
      .string()
      .trim()
      .min(1, "Give it a short title.")
      .refine((v) => bytes(v) <= MAX_TITLE_BYTES, `Keep the title under ${MAX_TITLE_BYTES} characters.`),
    terms: z.string().refine((v) => bytes(v) <= MAX_TERMS_BYTES, `Keep the details under ${MAX_TERMS_BYTES} characters.`),
  })
  .refine((v) => v.preset !== "custom" || new Date(v.customDate).getTime() > Date.now() + 60_000, {
    path: ["customDate"],
    message: "Pick a time in the future.",
  });
type Form = z.infer<typeof schema>;

function deadlineOf(v: Pick<Form, "preset" | "customDate">, nowMs: number): number {
  if (v.preset === "custom") return Math.floor(new Date(v.customDate).getTime() / 1000);
  return Math.floor(nowMs / 1000) + PRESETS.find((p) => p.key === v.preset)!.seconds;
}

export function NewEscrowScreen() {
  const router = useRouter();
  const { address, connect } = useWallet();
  const tx = useTx();
  const now = useNow(30_000);
  const readiness = useReadiness(address);

  const { register, handleSubmit, setValue, control, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { amount: "", recipient: "", preset: "7d", customDate: "", title: "", terms: "" },
  });
  const v = useWatch({ control }) as Form;
  const errors = formState.errors;

  const amount = parseAmount(v.amount ?? "") ?? 0n;
  const balance = readiness.data?.usdc ?? null;
  const balanceRaw = balance !== null ? (parseAmount(balance) ?? 0n) : null;
  const recipient = (v.recipient ?? "").trim();
  const recipientValid = StrKey.isValidEd25519PublicKey(recipient);
  const isSelf = recipientValid && recipient === address;

  const recipientCheck = useQuery({
    queryKey: ["readiness", recipient],
    queryFn: () => getReadiness(recipient),
    enabled: recipientValid && !isSelf,
    staleTime: 30_000,
  });

  const deadline = now !== null ? deadlineOf(v, now) : null;
  const tooMuch = balanceRaw !== null && amount > balanceRaw;

  const blocker = useMemo(() => {
    if (!address) return "connect";
    if (readiness.data && !readiness.data.exists) return "fund";
    if (readiness.data && readiness.data.usdc === null) return "trustline";
    return null;
  }, [address, readiness.data]);

  const submit = (fund: boolean) =>
    handleSubmit(async (form) => {
      if (form.recipient.trim() === address) return;
      const dl = deadlineOf(form, Date.now());
      const raw = parseAmount(form.amount)!;
      const result = await tx.invoke(
        fund ? "create_and_fund" : "create",
        [
          sc.address(address!),
          sc.address(form.recipient.trim()),
          sc.address(config.usdcSacId),
          sc.i128(raw),
          sc.u64(dl),
          sc.string(form.title.trim()),
          sc.string(form.terms.trim()),
        ],
        fund
          ? { pending: `Locking ${formatAmount(raw)} USDC…`, success: `Locked. ${formatAmount(raw)} USDC is in the contract.` }
          : { pending: "Saving the escrow…", success: "Saved. Lock it whenever you're ready." },
      );
      if (result?.returnValue !== undefined) router.push(`/escrow/${String(result.returnValue)}`);
    });

  const presetButton = (key: PresetKey, label: string) => {
    const active = v.preset === key;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={active}
        onClick={() => setValue("preset", key, { shouldValidate: true })}
        className={cn(
          "btn relative min-h-11 rounded-xl border px-4 text-sm",
          active ? "border-paper font-semibold text-night" : "border-white/[0.08] text-muted hover:text-paper",
        )}
      >
        {active && (
          <motion.span
            layoutId="preset-pill"
            className="absolute inset-0 rounded-[11px] bg-paper"
            transition={{ type: "spring", stiffness: 480, damping: 36 }}
          />
        )}
        <span className="relative">{label}</span>
      </button>
    );
  };

  return (
    <main className="relative mx-auto flex max-w-[1160px] flex-wrap items-start gap-6 px-[clamp(16px,3vw,32px)] pt-6 pb-20">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
        <div className="rise d1 flex flex-col gap-2.5 pt-2 pb-1">
          <span className="eyebrow text-xs">New escrow</span>
          <h1 className="font-serif text-[clamp(36px,4vw,50px)] leading-none font-normal tracking-[-0.02em]">
            Set up the deal. <em className="text-faint">We&apos;ll hold nothing.</em>
          </h1>
        </div>

        <Blocker kind={blocker} onConnect={() => connect()} />

        <form
          noValidate
          onSubmit={submit(true)}
          className="rise d2 overflow-hidden rounded-[28px] border border-white/[0.07] bg-panel"
        >
          <Section n="01" label="How much?" htmlFor="amount">
            <div className="field flex items-center gap-3 rounded-[18px] border border-white/[0.08] bg-white/[0.025] px-4 py-3.5" data-invalid={!!errors.amount || tooMuch}>
              <input
                id="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                aria-invalid={!!errors.amount}
                aria-describedby="amount-help"
                {...register("amount")}
                className="min-w-0 grow bg-transparent font-serif text-[clamp(40px,6vw,52px)] leading-none text-paper tabular outline-none"
              />
              <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white/5 py-[7px] pr-3.5 pl-[7px] text-sm font-semibold">
                <span className="flex size-[26px] items-center justify-center rounded-full bg-usdc text-[13px] font-bold text-white">$</span>
                USDC
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap gap-1.5">
                {["100", "250", "500"].map((p) => (
                  <Chip key={p} active={v.amount === p} onClick={() => setValue("amount", p, { shouldValidate: true })}>
                    {p}
                  </Chip>
                ))}
                {balance !== null && (
                  <Chip active={v.amount === balance.replace(/\.?0+$/, "")} onClick={() => setValue("amount", balance.replace(/\.?0+$/, ""), { shouldValidate: true })}>
                    Max
                  </Chip>
                )}
              </div>
              {balance !== null && (
                <span id="amount-help" className="text-[13px] text-faint">
                  You have <span className="font-mono text-muted">{formatBalance(balance)} USDC</span>
                </span>
              )}
            </div>
            <FieldError>{errors.amount?.message ?? (tooMuch ? "That's more USDC than your wallet holds." : null)}</FieldError>
          </Section>

          <Section n="02" label="Who gets paid?" htmlFor="recipient">
            <div className="field flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.025] py-1.5 pr-1.5 pl-3.5" data-invalid={!!errors.recipient || isSelf}>
              <input
                id="recipient"
                autoComplete="off"
                spellCheck={false}
                placeholder="G… their Stellar address"
                aria-invalid={!!errors.recipient}
                {...register("recipient")}
                className="h-11 min-w-0 grow bg-transparent font-mono text-[13px] text-paper outline-none"
              />
              <button
                type="button"
                onClick={async () => {
                  const text = await navigator.clipboard.readText().catch(() => "");
                  if (text) setValue("recipient", text.trim(), { shouldValidate: true });
                }}
                className="btn min-h-10 shrink-0 rounded-[11px] bg-white/[0.06] px-3.5 text-[13px] font-medium"
              >
                Paste
              </button>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={recipientStatusKey(recipientValid, isSelf, recipientCheck.data, !!errors.recipient)} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {errors.recipient ? (
                  <FieldError>{errors.recipient.message}</FieldError>
                ) : isSelf ? (
                  <FieldError>That&apos;s your own wallet. Pick who you&apos;re paying.</FieldError>
                ) : recipientValid && recipientCheck.data ? (
                  recipientCheck.data.usdc !== null ? (
                    <Hint ok>Looks good. This wallet can receive USDC.</Hint>
                  ) : (
                    <Hint>
                      {recipientCheck.data.exists ? "This wallet can't hold USDC yet." : "This wallet isn't on Testnet yet."} You can still lock it. They&apos;ll need to add USDC in Wallet setup before you release.
                    </Hint>
                  )
                ) : null}
              </motion.div>
            </AnimatePresence>
          </Section>

          <fieldset className="flex flex-col gap-3.5 border-t border-white/[0.06] px-7 py-[26px]">
            <legend className="float-left flex items-center gap-2.5 p-0 text-[15px] font-semibold">
              <span className="font-mono text-xs text-mint">03</span>How long should it wait?
            </legend>
            <div className="clear-both flex flex-wrap gap-2">{PRESETS.map((p) => presetButton(p.key, p.label))}</div>
            <AnimatePresence initial={false}>
              {v.preset === "custom" && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ ease: EASE }} className="overflow-hidden">
                  <label htmlFor="customDate" className="sr-only">
                    Deadline
                  </label>
                  <input
                    id="customDate"
                    type="datetime-local"
                    {...register("customDate")}
                    className="field h-[50px] w-full max-w-[320px] rounded-[14px] border border-white/[0.08] bg-white/[0.025] px-4 text-[15px] text-paper [color-scheme:dark] outline-none"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <FieldError>{errors.customDate?.message}</FieldError>
            {deadline !== null && !errors.customDate && (v.preset !== "custom" || v.customDate) && (
              <span className="text-[13px] leading-normal text-faint">
                Until <span className="text-paper">{formatLong(deadline)}</span>. If you haven&apos;t released by then, you can take the money back.
              </span>
            )}
          </fieldset>

          <Section n="04" label="What did you agree on?" htmlFor="title">
            <input
              id="title"
              placeholder="Logo design, final files"
              aria-invalid={!!errors.title}
              {...register("title")}
              className="field h-[50px] rounded-[14px] border border-white/[0.08] bg-white/[0.025] px-4 text-[15px] text-paper outline-none"
              data-invalid={!!errors.title}
            />
            <FieldError>{errors.title?.message}</FieldError>
            <label htmlFor="terms" className="sr-only">
              Details
            </label>
            <textarea
              id="terms"
              rows={3}
              placeholder="Three logo concepts, two rounds of revisions, final files as SVG and PNG."
              aria-invalid={!!errors.terms}
              {...register("terms")}
              className="field resize-y rounded-[14px] border border-white/[0.08] bg-white/[0.025] px-4 py-3.5 text-[15px] leading-[1.55] text-paper outline-none"
              data-invalid={!!errors.terms}
            />
            <div className="flex flex-wrap justify-between gap-2 text-[13px] text-faint">
              <span>Saved with the escrow, so be specific. Nobody can edit it later.</span>
              <span className="font-mono tabular">{bytes(v.terms ?? "")}/{MAX_TERMS_BYTES}</span>
            </div>
            <FieldError>{errors.terms?.message}</FieldError>
          </Section>
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </div>

      <aside aria-labelledby="summary" className="rise d3 flex min-w-0 flex-[1_1_340px] flex-col gap-3.5 lg:sticky lg:top-6">
        <div className="relative flex flex-col gap-5 overflow-hidden rounded-[28px] border border-mint/[0.22] bg-panel p-[26px]">
          <Glow className="-top-20 -right-[60px] h-[260px] w-[260px] blur-[50px]" />
          <h2 id="summary" className="eyebrow relative">
            You&apos;re about to lock
          </h2>
          <div className="relative flex items-center gap-[18px]">
            <VaultRing className="w-[84px] shrink-0" inner={false}>
              <span className="flex size-12 items-center justify-center rounded-[14px] bg-mint shadow-[0_0_30px_rgb(91_240_176/0.4)]">
                <LockIcon size={22} color="#060807" stroke="#060807" body="#060807" />
              </span>
            </VaultRing>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-serif text-[46px] leading-none tabular">
                <AnimatedAmount raw={amount} />
              </span>
              <span className="truncate font-mono text-xs text-muted">USDC{v.title ? ` · ${v.title}` : ""}</span>
            </div>
          </div>
          <dl className="relative flex flex-col gap-3 border-t border-dashed border-white/10 pt-4 text-sm">
            <Row k="From" v={address ? <span className="font-mono">You · {shortAddress(address)}</span> : <span className="text-faint">Connect a wallet</span>} />
            <Row k="To" v={recipientValid ? <span className="font-mono">{shortAddress(recipient)}</span> : <span className="text-faint">Not set</span>} />
            <Row k="Waits until" v={deadline !== null && (v.preset !== "custom" || v.customDate) ? formatShort(deadline) : "…"} />
            <Row k="HodL's fee" v={<span className="text-mint">None</span>} />
          </dl>
          <div className="relative flex flex-col gap-2.5 rounded-2xl bg-white/[0.025] p-4 text-[13px] leading-normal text-muted">
            <Bullet color="#7CC4FF">Only you can release it to them.</Bullet>
            <Bullet color="#C3A6FF">They can refund you any time.</Bullet>
            <Bullet color="#FF8A7A">After the deadline, you can take it back.</Bullet>
          </div>
          {address ? (
            <>
              <Button size="xl" onClick={submit(true)} disabled={tx.busy || !!blocker || tooMuch}>
                {amount > 0n ? `Lock ${amountLabel(amount)} USDC` : "Lock USDC"}
              </Button>
              <button
                type="button"
                onClick={submit(false)}
                disabled={tx.busy || blocker === "connect" || blocker === "fund"}
                className="relative min-h-10 text-sm text-muted hover:text-paper disabled:opacity-50"
              >
                Save it now, lock it later
              </button>
            </>
          ) : (
            <Button variant="paper" size="xl" onClick={() => connect()}>
              Connect wallet
            </Button>
          )}
        </div>
        <span className="flex items-center justify-center gap-2 text-[13px] text-faint">
          <ShieldPlainIcon size={14} className="text-mint" />
          You sign in your own wallet. We never see your keys.
        </span>
      </aside>
    </main>
  );
}

function recipientStatusKey(valid: boolean, self: boolean, data: unknown, error: boolean) {
  return `${valid}-${self}-${data ? JSON.stringify(data) : "none"}-${error}`;
}

function Section({ n, label, htmlFor, children }: { n: string; label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5 border-white/[0.06] px-7 py-[26px] not-first:border-t">
      <label htmlFor={htmlFor} className="flex items-center gap-2.5 text-[15px] font-semibold">
        <span className="font-mono text-xs text-mint">{n}</span>
        {label}
      </label>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "btn min-h-9 rounded-full border px-3 text-[13px]",
        active ? "border-mint/40 bg-mint/10 font-semibold text-mint" : "border-white/[0.08] text-muted hover:text-paper",
      )}
    >
      {children}
    </button>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {children && (
        <motion.span
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-center gap-2 text-[13px] text-coral"
        >
          <WarnIcon size={14} className="shrink-0" />
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function Hint({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-start gap-2 text-[13px] leading-normal", ok ? "text-mint" : "text-coral")}>
      {ok ? <CheckIcon size={14} className="mt-0.5 shrink-0" /> : <WarnIcon size={14} className="mt-0.5 shrink-0" />}
      <span>{children}</span>
    </span>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-faint">{k}</dt>
      <dd className="truncate text-right">{v}</dd>
    </div>
  );
}

function Bullet({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex gap-2.5">
      <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function Blocker({ kind, onConnect }: { kind: "connect" | "fund" | "trustline" | null; onConnect: () => void }) {
  if (!kind) return null;
  const copy = {
    connect: { text: "Connect a wallet to lock USDC. You can fill this in first.", action: <Button variant="paper" size="sm" onClick={onConnect}>Connect wallet</Button> },
    fund: { text: "Your wallet isn't on Testnet yet. Fund it with free XLM first.", action: <Link href="/setup" className="btn inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold">Wallet setup</Link> },
    trustline: { text: "Your wallet can't hold USDC yet. Add it in one signature.", action: <Link href="/setup" className="btn inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold">Fix it</Link> },
  }[kind];
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-coral/25 bg-coral/[0.05] px-5 py-4"
    >
      <span className="flex items-center gap-2.5 text-sm">
        <WarnIcon size={18} className="shrink-0 text-coral" />
        {copy.text}
      </span>
      {copy.action}
    </motion.div>
  );
}
