"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ExternalIcon, LogoutIcon, WarnIcon } from "@/components/ui/icons";
import { CopyButton } from "@/components/ui/motion";
import { Avatar, Button, Logo, TestnetPill } from "@/components/ui/primitives";
import { useWallet } from "@/components/wallet/WalletProvider";
import { cn } from "@/lib/cn";
import { explorer } from "@/lib/config";
import { shortAddress } from "@/lib/format";

const NAV = [
  { href: "/dashboard", label: "Overview", match: (p: string) => p === "/dashboard" || /^\/escrow\/\d/.test(p) },
  { href: "/escrow/new", label: "New escrow", match: (p: string) => p === "/escrow/new" },
  { href: "/setup", label: "Wallet setup", match: (p: string) => p === "/setup" },
];

export function AppHeader() {
  return (
    <header className="rise relative z-30 px-[clamp(16px,3vw,32px)] pt-4">
      <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/[0.07] bg-panel/70 py-2 pr-2 pl-4 backdrop-blur-[16px]">
        <Logo />
        <Suspense fallback={<NavLinks pathname="" />}>
          <ActiveNav />
        </Suspense>
        <div className="flex items-center gap-2">
          <TestnetPill className="hidden sm:inline-flex" />
          <WalletButton />
        </div>
      </div>
      <NetworkBanner />
    </header>
  );
}

// usePathname suspends under /escrow/[id], so it lives in its own boundary.
function ActiveNav() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="App"
      className="order-last flex w-full gap-0.5 overflow-x-auto rounded-[13px] bg-white/[0.03] p-1 md:order-none md:w-auto"
    >
      {NAV.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-10 flex-1 items-center justify-center rounded-[10px] px-3.5 text-sm font-medium whitespace-nowrap transition-colors md:flex-none",
              active ? "text-paper" : "text-muted hover:text-paper",
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-0 rounded-[10px] bg-mint/[0.12]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function WalletButton() {
  const { address, ready, connecting, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!address) {
    return (
      <Button variant="paper" size="sm" onClick={() => connect()} disabled={!ready || connecting}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </Button>
    );
  }

  return (
    <div className="relative" ref={menu}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="btn inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] py-[5px] pr-3.5 pl-[5px] font-mono text-[13px] text-paper"
      >
        <Avatar address={address} size={32} radius={9} />
        {shortAddress(address)}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            className="absolute right-0 z-50 mt-2 flex w-[260px] origin-top-right flex-col gap-1 rounded-[18px] border border-white/[0.08] bg-panel-2 p-2 shadow-[0_24px_60px_rgb(0_0_0/0.55)]"
          >
            <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
              <span className="truncate font-mono text-xs text-muted" title={address}>
                {address.slice(0, 10)}…{address.slice(-6)}
              </span>
              <CopyButton text={address} label="Copy address" />
            </div>
            <MenuLink href={explorer.account(address)} external>
              View on Stellar Expert <ExternalIcon size={13} />
            </MenuLink>
            <MenuLink href="/activity" onClick={() => setOpen(false)}>
              Your activity
            </MenuLink>
            <MenuLink href="/setup" onClick={() => setOpen(false)}>
              Wallet setup
            </MenuLink>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                disconnect();
              }}
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm text-coral hover:bg-white/[0.04]"
            >
              <LogoutIcon size={15} /> Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuLink({
  href,
  external,
  onClick,
  children,
}: {
  href: string;
  external?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls = "flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-paper hover:bg-white/[0.04]";
  return external ? (
    <a role="menuitem" href={href} target="_blank" rel="noreferrer" className={cls}>
      {children}
    </a>
  ) : (
    <Link role="menuitem" href={href} onClick={onClick} className={cls}>
      {children}
    </Link>
  );
}

function NetworkBanner() {
  const { onTestnet, address } = useWallet();
  return (
    <AnimatePresence>
      {address && onTestnet === false && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mx-auto max-w-[1160px] overflow-hidden"
        >
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-coral/30 bg-coral/[0.06] px-4 py-3 text-sm">
            <WarnIcon size={18} className="shrink-0 text-coral" />
            <span>
              <span className="font-semibold">Your wallet is on another network.</span>{" "}
              <span className="text-muted">Switch it to Testnet in your wallet&apos;s settings, then reconnect.</span>
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
