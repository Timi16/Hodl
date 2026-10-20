/** HodL building blocks. Server-safe: no hooks here. */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { explorer } from "@/lib/config";
import { avatarColor, initials, shortHash } from "@/lib/format";
import { LOOK, type Phase } from "@/lib/hodl/phase";
import { ExternalIcon } from "./icons";

// ------------------------------------------------------------------- logo

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="11" fill="#5BF0B0" />
      <rect x="8.5" y="8.5" width="5" height="19" rx="2.5" fill="#060807" />
      <rect x="22.5" y="8.5" width="5" height="19" rx="2.5" fill="#060807" />
      <path d="M14.8 17.2v-2.1a3.2 3.2 0 0 1 6.4 0v2.1" fill="none" stroke="#060807" strokeWidth="2.3" strokeLinecap="round" />
      <rect x="13.5" y="17" width="9" height="7.5" rx="2.2" fill="#060807" />
      <circle cx="18" cy="20.4" r="1.25" fill="#5BF0B0" />
      <rect x="17.45" y="20.6" width="1.1" height="2.2" rx="0.55" fill="#5BF0B0" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-paper" aria-label="HodL home">
      <LogoMark />
      <span className="text-lg font-bold tracking-[-0.03em]">HodL</span>
    </Link>
  );
}

// ---------------------------------------------------------------- buttons

type Variant = "mint" | "paper" | "ghost" | "outline" | "disabled";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  mint: "shine bg-mint text-night font-semibold shadow-[0_12px_36px_rgb(91_240_176/0.26)]",
  paper: "bg-paper text-night font-semibold",
  ghost: "border border-white/10 bg-white/[0.03] text-paper font-medium",
  outline: "border border-white/10 bg-transparent text-paper font-medium",
  disabled: "bg-white/[0.04] text-faint font-semibold cursor-not-allowed",
};
const SIZES: Record<Size, string> = {
  sm: "min-h-11 px-4 rounded-xl text-sm gap-2",
  md: "min-h-12 px-5 rounded-[13px] text-[15px] gap-2",
  lg: "min-h-[54px] px-6 rounded-[14px] text-base gap-2.5",
  xl: "min-h-[58px] px-6 rounded-2xl text-base gap-2.5",
};

export function buttonClass(variant: Variant = "mint", size: Size = "md", className?: string) {
  return cn(
    "btn inline-flex items-center justify-center text-center select-none disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  variant = "mint",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "mint",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ------------------------------------------------------------ status chip

export function StatusBadge({ phase, size = "sm", pulse }: { phase: Phase; size?: "sm" | "md"; pulse?: boolean }) {
  const look = LOOK[phase];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-[5px] text-[13px]",
      )}
      style={{
        background: `rgb(${look.rgb} / 0.12)`,
        borderColor: `rgb(${look.rgb} / 0.35)`,
        color: look.fg,
      }}
    >
      <Dot color={look.fg} pulse={pulse ?? phase === "funded"} size={size === "sm" ? 6 : 7} />
      {look.badge}
    </span>
  );
}

export function Dot({ color, pulse, size = 7 }: { color: string; pulse?: boolean; size?: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      {pulse && <span className="ping absolute inset-0 rounded-full" style={{ background: color }} />}
      <span className="absolute inset-0 rounded-full" style={{ background: color }} />
    </span>
  );
}

export function TestnetPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/[0.07] px-[11px] py-1.5 text-xs text-muted",
        className,
      )}
    >
      <Dot color="#5BF0B0" pulse />
      Testnet
    </span>
  );
}

// ----------------------------------------------------------------- avatar

export function Avatar({
  address,
  size = 34,
  radius = 10,
  soft,
  color: fixed,
}: {
  address: string;
  size?: number;
  radius?: number;
  /** Tinted tile with coloured text instead of a solid tile. */
  soft?: boolean;
  /** Fixed colour (e.g. by role); defaults to a stable colour per address. */
  color?: string;
}) {
  const color = fixed ?? avatarColor(address);
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center font-sans font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: size >= 48 ? 13 : 11,
        background: soft ? `color-mix(in srgb, ${color} 16%, transparent)` : color,
        color: soft ? color : "#060807",
      }}
    >
      {initials(address)}
    </span>
  );
}

// --------------------------------------------------------------- receipts

export function TxLink({ hash, className, children }: { hash: string; className?: string; children?: ReactNode }) {
  return (
    <a
      href={explorer.tx(hash)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-lg bg-white/[0.04] px-2 py-[3px] font-mono text-xs text-paper transition-colors hover:bg-white/[0.08]",
        className,
      )}
      aria-label={`Transaction ${hash} on Stellar Expert`}
    >
      {children ?? shortHash(hash)}
      <ExternalIcon size={11} />
    </a>
  );
}

// ------------------------------------------------------------- containers

export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-[26px] border border-white/[0.07] bg-panel", className)} {...props} />;
}

export function Eyebrow({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("eyebrow", className)} {...props} />;
}

/** Blurred colour blob behind content. */
export function Glow({ className, color = "rgb(91 240 176 / 0.12)", drift }: { className?: string; color?: string; drift?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute rounded-full blur-[90px]", drift && "drift", className)}
      style={{ background: color }}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-xl bg-white/[0.05]", className)} />;
}

/** Big serif amount with a small mono unit: "250.00 USDC". */
export function Amount({
  value,
  className,
  unitClassName,
  color,
}: {
  value: ReactNode;
  className?: string;
  unitClassName?: string;
  color?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cn("font-serif leading-none tracking-[-0.02em] tabular", className)} style={{ color }}>
        {value}
      </span>
      <span className={cn("font-mono text-xs text-muted", unitClassName)}>USDC</span>
    </span>
  );
}
