"use client";

/**
 * Motion is functional: it confirms what the money did (the padlock snaps
 * shut, amounts count, receipts slide in). Ambient loops live in CSS, and
 * everything respects prefers-reduced-motion through <MotionConfig>.
 */
import { AnimatePresence, motion, useMotionValueEvent, useSpring, useTransform } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { USDC_DECIMALS } from "@/lib/config";
import { formatAmount, timeLeft } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { CheckIcon, CopyIcon } from "./icons";

export const EASE = [0.2, 0.7, 0.2, 1] as const;

// ------------------------------------------------------------- reveal

/** Rises into view once, on scroll. */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const M = motion[as];
  return (
    <M
      className={className}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      // "some" + a bottom inset, not a fraction: a block taller than the
      // screen would otherwise never reach the threshold on a phone.
      viewport={{ once: true, amount: "some", margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </M>
  );
}

/** Children rise one after another on mount. */
export function Stagger({ children, className, gap = 0.08 }: { children: ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } } }}
    >
      {children}
    </motion.div>
  );
}

// ----------------------------------------------------------- amounts

/** An amount that springs to its new value; counts up from 0 on first show if `countUp`. */
export function AnimatedAmount({ raw, countUp = false }: { raw: string | bigint; countUp?: boolean }) {
  const target = Number(BigInt(raw)) / 10 ** USDC_DECIMALS;
  const spring = useSpring(countUp ? 0 : target, { stiffness: 90, damping: 22, mass: 0.8 });
  const text = useTransform(spring, (v) =>
    v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  );
  const [settled, setSettled] = useState(!countUp);
  useEffect(() => {
    spring.set(target);
  }, [spring, target]);
  useMotionValueEvent(spring, "animationComplete", () => setSettled(true));
  // Exact text once settled, so 0.1234567 USDC never shows rounded wrong.
  return settled && spring.get() === target ? <>{formatAmount(raw)}</> : <motion.span>{text}</motion.span>;
}

// -------------------------------------------------------------- lock

/** The padlock: the shackle drops shut when `locked` turns true, swings open when false. */
export function AnimatedLock({
  locked,
  size = 28,
  color = "#060807",
  hole = "#5BF0B0",
}: {
  locked: boolean;
  size?: number;
  color?: string;
  hole?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={locked ? "Locked" : "Not locked"}
    >
      <motion.path
        d="M7.75 10.5V7.75a4.25 4.25 0 0 1 8.5 0v2.75"
        initial={false}
        animate={locked ? { y: 0, rotate: 0 } : { y: -2.6, rotate: -18 }}
        style={{ originX: "16.25px", originY: "10.5px" }}
        transition={{ type: "spring", stiffness: 520, damping: 22 }}
      />
      <rect x="4.25" y="10.5" width="15.5" height="10.75" rx="3.25" fill={locked ? color : "rgba(0,0,0,0)"} />
      <circle cx="12" cy="15.6" r="1.45" fill={locked ? hole : color} stroke="none" />
    </svg>
  );
}

// ---------------------------------------------------------- countdown

/** "2d 04h left" in mono; coral under 24 h, "Passed" after. */
export function Countdown({
  deadline,
  suffix = " left",
  className,
  passedText = "Passed",
}: {
  deadline: number;
  suffix?: string;
  className?: string;
  passedText?: string;
}) {
  const now = useNow(1000);
  if (now === null) return <span className={cn("font-mono tabular text-muted", className)}>…</span>;
  const left = timeLeft(deadline, now);
  const urgent = left !== null && deadline - now / 1000 < 86_400;
  return (
    <span
      className={cn("font-mono tabular", className)}
      style={{ color: left === null ? "#FF8A7A" : urgent ? "#FF8A7A" : undefined, fontWeight: urgent ? 600 : undefined }}
    >
      {left === null ? passedText : `${left}${suffix}`}
    </span>
  );
}

// -------------------------------------------------------------- copy

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn(
        "btn inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-muted hover:text-paper",
        className,
      )}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      aria-label={copied ? "Copied" : label}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? "y" : "n"}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.15 }}
          className="inline-flex"
        >
          {copied ? <CheckIcon size={14} className="text-mint" /> : <CopyIcon size={14} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

// -------------------------------------------------------------- tabs

/** Segmented control with a sliding indicator. */
export function SegmentTabs<T extends string>({
  value,
  onChange,
  options,
  label,
  tone = "paper",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  tone?: "paper" | "mint";
}) {
  const id = useId();
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-0.5 rounded-xl bg-white/[0.03] p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative min-h-9 rounded-[9px] px-3.5 text-[13px] transition-colors",
              active ? (tone === "paper" ? "font-semibold text-night" : "text-paper") : "font-medium text-muted hover:text-paper",
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-${id}`}
                className={cn("absolute inset-0 rounded-[9px]", tone === "paper" ? "bg-paper" : "bg-mint/[0.12]")}
                transition={{ type: "spring", stiffness: 480, damping: 36 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------- accordion

export function AccordionItem({
  question,
  answer,
  open,
  onToggle,
}: {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  return (
    <div className="rounded-[18px] border border-white/[0.07] bg-panel">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex min-h-[66px] w-full items-center justify-between gap-4 px-[22px] text-left text-base font-medium"
      >
        <span>{question}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="flex size-[30px] shrink-0 items-center justify-center rounded-full border border-white/10 text-base text-mint"
          aria-hidden="true"
        >
          +
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <p className="px-[22px] pb-[22px] text-[15px] leading-[1.65] text-muted">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------- dialog

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    // Focus the first action, the confirm button.
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("button")?.focus());
    return () => previous?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 cursor-default bg-night/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="relative flex w-full max-w-[420px] flex-col gap-3 rounded-[24px] border border-white/[0.08] bg-panel-2 p-6 shadow-[0_30px_80px_rgb(0_0_0/0.6)]"
          >
            <h2 id={titleId} className="font-serif text-[28px] leading-[1.1] font-normal">
              {title}
            </h2>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
