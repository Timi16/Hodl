import Link from "next/link";
import type { ReactNode } from "react";
import { Faq } from "@/components/landing/Faq";
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  ExternalIcon,
  LockIcon,
  LockSoftIcon,
  MinusCircleIcon,
  RefundIcon,
  ReleasedIcon,
  ShieldIcon,
  WarnIcon,
} from "@/components/ui/icons";
import { Reveal } from "@/components/ui/motion";
import { ButtonLink, Dot, Glow, Logo } from "@/components/ui/primitives";
import { VaultRing } from "@/components/ui/VaultRing";
import { config, explorer } from "@/lib/config";

export default function Landing() {
  return (
    <div className="overflow-x-clip bg-night text-paper">
      <SiteHeader />
      <Hero />
      <Marquee />

      <Section eyebrow="The problem" title={<>Every online deal starts with someone going first. <em className="text-faint">With HodL, nobody has to.</em></>} narrow>
        <Grid min={280}>
          {[
            ["Pay first,", "and hope the work actually shows up."],
            ["Deliver first,", "and hope the money does."],
            ["Use a middleman,", "and pay them to sit on your money for days."],
          ].map(([a, b], i) => (
            <Reveal key={a} delay={i * 0.08} className="lift flex flex-col gap-2.5 rounded-[24px] border border-white/[0.07] bg-panel p-7">
              <span className="font-serif text-[30px]">{a}</span>
              <span className="text-[15px] leading-[1.55] text-muted">{b}</span>
            </Reveal>
          ))}
        </Grid>
        <Reveal>
          <p className="font-serif text-[26px] text-mint">
            <em>HodL swaps hope for a contract.</em>
          </p>
        </Reveal>
      </Section>

      <Section
        id="how"
        eyebrow="How it works"
        title={<>Three steps. <em>Zero middlemen.</em></>}
        aside="The whole thing takes about a minute and two signatures."
      >
        <Grid min={320}>
          <StepCard n="01" title="Agree on the terms" text="Set the amount, who gets paid and a deadline. The terms are saved on-chain, so nobody can change them later." delay={0}>
            <div className="flex h-full flex-col justify-center gap-2 bg-[radial-gradient(circle_at_50%_120%,rgb(91_240_176/0.12),transparent_70%)] p-6">
              {[
                ["Amount", "250.00 USDC"],
                ["Pay to", "GBQ7…K2LD"],
                ["Deadline", "7 days"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-[11px] text-[13px]">
                  <span className="text-faint">{k}</span>
                  <span className="font-mono">{v}</span>
                </div>
              ))}
            </div>
          </StepCard>
          <StepCard n="02" title="Lock the money" text="One tap in your wallet moves the USDC into the contract. The other side can see it's really there before they start." delay={0.08}>
            <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_50%,rgb(91_240_176/0.14),transparent_65%)]">
              <VaultRing className="w-[170px]">
                <span className="glow flex size-[60px] items-center justify-center rounded-[18px] bg-mint">
                  <LockIcon size={28} stroke="#060807" body="#060807" />
                </span>
              </VaultRing>
            </div>
          </StepCard>
          <StepCard n="03" title="Settle it" text="Release when you're happy. They can refund if it falls through. Miss the deadline and it comes back to you." delay={0.16}>
            <div className="flex h-full flex-col justify-center gap-2 bg-[radial-gradient(circle_at_50%_120%,rgb(124_196_255/0.12),transparent_70%)] p-6 text-[13px]">
              <div className="flex items-center gap-2.5 rounded-xl border border-sky/30 bg-sky/[0.08] px-3.5 py-[11px]">
                <span className="size-2 rounded-full bg-sky" />
                Released to recipient
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-[11px] text-muted">
                <span className="size-2 rounded-full bg-lilac" />
                or refunded to payer
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-[11px] text-muted">
                <span className="size-2 rounded-full bg-coral" />
                or returned after the deadline
              </div>
            </div>
          </StepCard>
        </Grid>
      </Section>

      <Section id="outcomes" eyebrow="Outcomes" title={<>Three ways it can end. <em>All of them fair.</em></>} narrow>
        <Grid min={320}>
          <Outcome color="124 196 255" hex="#7CC4FF" icon={<ReleasedIcon size={22} />} title="Released" text="The work is done. You release the money and they're paid in seconds." foot="250.00 USDC → recipient" />
          <Outcome color="195 166 255" hex="#C3A6FF" icon={<RefundIcon size={22} />} title="Refunded" text="Plans changed. They send it straight back. No chasing, no awkward emails." foot="250.00 USDC → payer" delay={0.08} />
          <Outcome color="255 138 122" hex="#FF8A7A" icon={<ClockIcon size={22} />} title="Returned" text="The deadline passed with no release. Your money comes home, untouched." foot="250.00 USDC → payer" delay={0.16} />
        </Grid>
      </Section>

      <section id="trust" className="mx-auto max-w-[1200px] scroll-mt-24 px-6 pt-[120px] pb-10">
        <Reveal className="relative flex flex-wrap gap-12 overflow-hidden rounded-[36px] border border-white/[0.07] bg-panel p-[clamp(28px,5vw,64px)]">
          <Glow drift className="-right-[120px] -bottom-[160px] h-[480px] w-[480px] blur-[80px]" color="rgb(91 240 176 / 0.10)" />
          <div className="relative flex min-w-0 flex-[1_1_360px] flex-col gap-[18px]">
            <span className="eyebrow text-xs text-mint">Why it&apos;s safe</span>
            <h2 className="font-serif text-[clamp(32px,3.8vw,52px)] leading-[1.05] font-normal tracking-[-0.02em]">
              Rules written in code. <em className="text-mint">In public.</em>
            </h2>
            <p className="max-w-[420px] text-base leading-relaxed text-muted">
              The money lives in a public contract on Stellar, not in a company account. These rules are part of it, and they
              apply to everyone.
            </p>
            <a
              href={explorer.contract()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-2 self-start rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 font-mono text-xs text-muted transition-colors hover:text-paper"
            >
              <Dot color="#5BF0B0" pulse />
              <span className="truncate">Live contract {config.contractId.slice(0, 6)}…{config.contractId.slice(-6)}</span>
              <ExternalIcon size={12} />
            </a>
          </div>
          <div className="relative grid min-w-0 flex-[1.4_1_520px] grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3">
            <Rule color="#5BF0B0" icon={<LockSoftIcon size={26} />} title="Only you can release" text="The contract won't pay out without the payer's signature." />
            <Rule color="#C3A6FF" icon={<ShieldIcon size={26} />} title="Only they can refund" text="Sending the money back needs the recipient's signature." />
            <Rule color="#FF8A7A" icon={<WarnIcon size={26} />} title="Nothing pays out twice" text="Once an escrow is settled, it's closed for good." />
            <Rule color="#7CC4FF" icon={<MinusCircleIcon size={26} />} title="No freeze switch" text="No admin function can move or freeze your funds. Code upgrades are public, and can be locked for good." />
          </div>
        </Reveal>
      </section>

      <Section eyebrow="The difference" title={<>Escrow, <em>minus the waiting.</em></>} narrow>
        <Grid min={380}>
          <Reveal className="flex flex-col gap-5 rounded-[28px] border border-dashed border-white/[0.12] p-8">
            <span className="text-[15px] font-semibold text-faint">The usual way</span>
            <ul className="flex flex-col gap-4 text-[15px] text-faint">
              {["A company holds your money", "Days for bank transfers to clear", "Support tickets, business hours", "Fees taken as a cut of the deal", "Proof is an email you have to trust"].map((t) => (
                <li key={t} className="flex gap-3">
                  <span aria-hidden="true">—</span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.08} className="relative flex flex-col gap-5 overflow-hidden rounded-[28px] border border-mint/30 bg-panel p-8">
            <Glow className="-top-20 -right-20 h-[280px] w-[280px] blur-[60px]" />
            <span className="relative text-[15px] font-semibold text-mint">With HodL</span>
            <ul className="relative flex flex-col gap-4 text-[15px]">
              {["A contract holds it. Only the two of you can move it", "Settles in seconds on Stellar", "Works 24/7, no one to wait on", "No cut. Just tiny network fees", "Every step leaves a public receipt"].map((t) => (
                <li key={t} className="flex gap-3">
                  <CheckIcon size={18} className="shrink-0 text-mint" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </Grid>
      </Section>

      <Section eyebrow="Made for" title={<>Any deal between <em>people who just met.</em></>} narrow>
        <Grid min={250}>
          {[
            ["Freelance work", "The client locks your fee before you start. You deliver knowing it's there."],
            ["P2P trades", "Swap with someone from a group chat without either side going first."],
            ["Online sales", "Buyer pays in, seller ships, buyer releases when it arrives."],
            ["Bounties", "Prove the reward is real before anyone writes a line."],
          ].map(([a, b], i) => (
            <Reveal key={a} delay={i * 0.06} className="lift flex flex-col gap-3 rounded-[24px] border border-white/[0.07] bg-panel p-[26px]">
              <span className="font-serif text-[26px]">{a}</span>
              <span className="text-sm leading-[1.55] text-muted">{b}</span>
            </Reveal>
          ))}
        </Grid>
      </Section>

      <section id="faq" className="mx-auto flex max-w-[1200px] scroll-mt-24 flex-wrap gap-12 px-6 pt-[120px] pb-10">
        <Reveal className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <span className="eyebrow text-xs text-mint">FAQ</span>
          <h2 className="font-serif text-[clamp(32px,3.8vw,52px)] leading-[1.05] font-normal tracking-[-0.02em]">
            Good <em>questions.</em>
          </h2>
          <p className="text-[15px] leading-relaxed text-muted">
            Still unsure?{" "}
            <a href={config.repoUrl} target="_blank" rel="noreferrer" className="text-mint hover:text-mint-hover">
              Open an issue on GitHub
            </a>{" "}
            and we&apos;ll answer.
          </p>
        </Reveal>
        <Faq />
      </section>

      <section className="mx-auto max-w-[1200px] px-6 pt-[120px] pb-[120px]">
        <Reveal className="relative flex flex-col items-center gap-6 overflow-hidden rounded-[36px] border border-white/[0.07] bg-panel px-6 py-[clamp(48px,7vw,96px)] text-center">
          <div aria-hidden="true" className="spin absolute top-1/2 left-1/2 -mt-[280px] -ml-[280px] size-[560px] rounded-full border border-dashed border-mint/[0.18]" />
          <div aria-hidden="true" className="spinr absolute top-1/2 left-1/2 -mt-[200px] -ml-[200px] size-[400px] rounded-full border border-white/5" />
          <div aria-hidden="true" className="absolute top-1/2 left-1/2 -mt-[200px] -ml-[300px] h-[400px] w-[600px] bg-[radial-gradient(closest-side,rgb(91_240_176/0.16),transparent)]" />
          <h2 className="relative font-serif text-[clamp(36px,4.6vw,64px)] leading-none font-normal tracking-[-0.025em]">
            Make your next deal
            <br />
            <em className="text-mint">the easy one.</em>
          </h2>
          <p className="relative max-w-[440px] text-base leading-relaxed text-muted">
            Connect a Stellar wallet and lock your first escrow in about a minute. It&apos;s Testnet, so it costs nothing to try.
          </p>
          <div className="relative flex flex-wrap justify-center gap-3">
            <ButtonLink href="/escrow/new" size="lg" className="px-7">
              Start an escrow
            </ButtonLink>
            <ButtonLink href="/setup" variant="ghost" size="lg">
              Set up a wallet
            </ButtonLink>
          </div>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}

// ------------------------------------------------------------------ parts

function SiteHeader() {
  return (
    <header className="rise relative z-30 px-[clamp(16px,3vw,32px)] pt-4">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-3 rounded-[18px] border border-white/[0.07] bg-panel/70 py-2 pr-2 pl-4 backdrop-blur-[16px]">
        <Logo />
        <nav aria-label="Main" className="order-last flex w-full flex-wrap justify-center gap-0.5 sm:order-none sm:w-auto sm:grow">
          {[
            ["#how", "How it works"],
            ["#outcomes", "Outcomes"],
            ["#trust", "Why it's safe"],
            ["#faq", "FAQ"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="px-3.5 py-3 text-sm font-medium text-muted transition-colors hover:text-paper">
              {label}
            </a>
          ))}
        </nav>
        <ButtonLink href="/dashboard" variant="paper" size="sm" className="ml-auto sm:ml-0">
          Open app
        </ButtonLink>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative -mt-20 pt-20">
      <div aria-hidden="true" className="dot-grid absolute inset-0" />
      <Glow drift className="top-[60px] right-[4%] size-[520px]" color="rgb(91 240 176 / 0.16)" />
      <Glow drift className="top-[320px] right-[30%] size-[340px] [animation-delay:-6s]" color="rgb(124 196 255 / 0.10)" />
      <div className="relative mx-auto flex max-w-[1200px] flex-wrap items-center gap-12 px-6 pt-[clamp(40px,8vw,72px)] pb-[clamp(72px,10vw,110px)]">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col items-start gap-[26px]">
          <span className="rise d1 inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-[7px] text-[13px] text-muted">
            <Dot color="#5BF0B0" pulse size={8} />
            Live on Stellar Testnet
          </span>
          <h1 className="rise d2 font-serif text-[clamp(44px,5.4vw,74px)] leading-[0.98] font-normal tracking-[-0.025em]">
            Pay strangers
            <br />
            <em className="text-mint">without</em> trusting them.
          </h1>
          <p className="rise d3 max-w-[470px] text-[17px] leading-relaxed text-muted">
            HodL locks USDC in a smart contract until the job is done. You release it, they refund it, or the deadline sends it
            back. No middleman ever holds your money.
          </p>
          <div className="rise d4 flex flex-wrap gap-3">
            <ButtonLink href="/escrow/new" size="lg" className="shadow-[0_14px_44px_rgb(91_240_176/0.28)]">
              Start an escrow
              <ArrowRightIcon size={16} />
            </ButtonLink>
            <a href="#how" className="btn inline-flex min-h-[54px] items-center rounded-[14px] border border-white/10 bg-white/[0.03] px-6 text-base font-medium">
              See how it works
            </a>
          </div>
          <span className="rise d5 font-mono text-xs tracking-[0.04em] text-faint">Non-custodial · Open source · Test USDC, no real money</span>
        </div>

        <div className="rise d3 flex min-w-0 flex-[1_1_440px] justify-center">
          <div className="relative w-[min(460px,100%)]">
            <VaultRing className="w-full" label="250 USDC locked in the contract between a payer and a recipient">
              <div aria-hidden="true" className="absolute inset-[22%] rounded-full border border-mint/[0.18] bg-[radial-gradient(circle_at_50%_35%,rgb(91_240_176/0.14),transparent_70%)]" />
              <span className="glow relative flex size-[76px] items-center justify-center rounded-[24px] bg-mint">
                <LockIcon size={36} stroke="#060807" body="#060807" />
              </span>
              <span className="relative font-mono text-[11px] tracking-[0.14em] text-faint">LOCKED IN CONTRACT</span>
              <span className="relative flex items-baseline gap-2">
                <span className="font-serif text-[clamp(44px,6vw,56px)] leading-none tracking-[-0.02em]">250.00</span>
                <span className="font-mono text-[13px] text-muted">USDC</span>
              </span>
            </VaultRing>
            <FloatChip className="float top-[22%] -left-[2%] sm:-left-[6%]" avatar="GC" bg="#5BF0B0" role="Payer" addr="GCX4…7QPA" />
            <FloatChip className="float2 top-[58%] -right-[2%] sm:-right-[6%]" avatar="GB" bg="#C3A6FF" role="Recipient" addr="GBQ7…K2LD" />
            <div aria-hidden="true" className="float absolute -bottom-[2%] left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-mint/25 bg-[rgb(18_22_19/0.85)] px-3.5 py-2 text-xs whitespace-nowrap text-muted">
              <span className="size-1.5 rounded-full bg-mint" />
              Releases only when the payer says so
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FloatChip({ className, avatar, bg, role, addr }: { className: string; avatar: string; bg: string; role: string; addr: string }) {
  return (
    <div aria-hidden="true" className={`absolute flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-[rgb(18_22_19/0.85)] py-2.5 pr-3.5 pl-2.5 backdrop-blur-md ${className}`}>
      <span className="flex size-[34px] items-center justify-center rounded-full text-xs font-bold text-night" style={{ background: bg }}>
        {avatar}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[11px] text-faint">{role}</span>
        <span className="font-mono text-xs">{addr}</span>
      </span>
    </div>
  );
}

function Marquee() {
  const items = ["Stellar", "Soroban smart contracts", "USDC by Circle", "Freighter", "xBull", "Lobstr", "Albedo", "Hana"];
  // Two identical runs; the track scrolls by half its width for a seamless loop.
  const run = (copy: number) =>
    items.map((t) => (
      <span key={`${copy}-${t}`} className="flex items-center gap-14" aria-hidden={copy === 1 || undefined}>
        <span>{t}</span>
        <span className="text-mint" aria-hidden="true">
          ✦
        </span>
      </span>
    ));
  return (
    <section aria-label="Built on" className="edge-fade border-y border-white/[0.06] py-[22px]">
      <div className="marquee gap-14 pr-14 text-[17px] font-semibold whitespace-nowrap text-faint">
        {run(0)}
        {run(1)}
      </div>
    </section>
  );
}

function Section({
  id,
  eyebrow,
  title,
  aside,
  narrow,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  aside?: string;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto flex max-w-[1200px] scroll-mt-24 flex-col gap-12 px-6 pt-[clamp(80px,10vw,120px)] pb-10">
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div className={`flex flex-col gap-4 ${narrow ? "max-w-[820px]" : ""}`}>
          <span className="eyebrow text-xs text-mint">{eyebrow}</span>
          <h2 className="font-serif text-[clamp(32px,3.8vw,52px)] leading-[1.05] font-normal tracking-[-0.02em]">{title}</h2>
        </div>
        {aside && <span className="max-w-[320px] text-[15px] text-muted">{aside}</span>}
      </Reveal>
      {children}
    </section>
  );
}

function Grid({ min, children }: { min: number; children: ReactNode }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` }}>
      {children}
    </div>
  );
}

function StepCard({ n, title, text, delay, children }: { n: string; title: string; text: string; delay: number; children: ReactNode }) {
  return (
    <Reveal delay={delay} className="lift flex flex-col overflow-hidden rounded-[28px] border border-white/[0.07] bg-panel">
      <div aria-hidden="true" className="h-[220px]">
        {children}
      </div>
      <div className="flex flex-col gap-2.5 px-7 pt-6 pb-7">
        <span className="font-mono text-xs text-mint">{n}</span>
        <h3 className="text-xl font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="text-[15px] leading-[1.55] text-muted">{text}</p>
      </div>
    </Reveal>
  );
}

function Outcome({
  color,
  hex,
  icon,
  title,
  text,
  foot,
  delay = 0,
}: {
  color: string;
  hex: string;
  icon: ReactNode;
  title: string;
  text: string;
  foot: string;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className="lift relative flex min-h-[280px] flex-col gap-3.5 overflow-hidden rounded-[28px] border border-white/[0.07] bg-panel px-7 py-8">
      <Glow className="-top-[60px] -left-10 h-[200px] w-[240px] blur-[60px]" color={`rgb(${color} / 0.16)`} />
      <span className="relative flex size-12 items-center justify-center rounded-2xl" style={{ background: `rgb(${color} / 0.14)`, color: hex }}>
        {icon}
      </span>
      <h3 className="relative font-serif text-[34px] font-normal">{title}</h3>
      <p className="relative text-[15px] leading-[1.55] text-muted">{text}</p>
      <span className="relative mt-auto font-mono text-xs" style={{ color: hex }}>
        {foot}
      </span>
    </Reveal>
  );
}

function Rule({ color, icon, title, text }: { color: string; icon: ReactNode; title: string; text: string }) {
  return (
    <div className="lift flex flex-col gap-2.5 rounded-[20px] border border-white/[0.07] bg-white/[0.02] p-[22px]">
      <span style={{ color }}>{icon}</span>
      <span className="text-base font-semibold">{title}</span>
      <span className="text-sm leading-[1.55] text-muted">{text}</span>
    </div>
  );
}

function Footer() {
  const cols: [string, [string, string, boolean?][]][] = [
    ["Product", [["/dashboard", "Open app"], ["/escrow/new", "Start an escrow"], ["/setup", "Wallet setup"]]],
    ["Learn", [["#how", "How it works"], ["#trust", "Why it's safe"], ["/how-it-works", "For reviewers"]]],
    ["Build", [[config.repoUrl, "GitHub", true], ["/api/stats", "Public API", true], [explorer.contract(), "Stellar Expert", true]]],
  ];
  return (
    <footer className="overflow-hidden border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-6 pt-16">
        <div className="flex flex-wrap justify-between gap-x-16 gap-y-10">
          <div className="flex max-w-[360px] flex-[1_1_280px] flex-col gap-4">
            <Logo />
            <p className="text-sm leading-relaxed text-muted">Escrow for people who just met. The contract holds the money. We never do.</p>
          </div>
          <nav aria-label="Footer" className="grid min-w-0 flex-[2_1_440px] grid-cols-3 gap-6">
            {cols.map(([head, links]) => (
              <div key={head} className="flex flex-col gap-1.5">
                <h3 className="eyebrow mb-2">{head}</h3>
                {links.map(([href, label, ext]) =>
                  ext ? (
                    <a key={label} href={href} target="_blank" rel="noreferrer" className="flex min-h-8 items-center text-sm text-muted hover:text-paper">
                      {label}
                    </a>
                  ) : (
                    <Link key={label} href={href} className="flex min-h-8 items-center text-sm text-muted hover:text-paper">
                      {label}
                    </Link>
                  ),
                )}
              </div>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] py-5 text-[13px] text-faint">
          <span>© 2026 HodL. Testnet only, no real funds.</span>
          <span className="inline-flex items-center gap-2">
            <Dot color="#5BF0B0" pulse />
            Stellar Testnet
          </span>
        </div>
      </div>
      <div aria-hidden="true" className="outline-text mx-auto -mb-[0.12em] max-w-[1200px] px-6 font-serif text-[clamp(120px,24vw,340px)] leading-[0.9] tracking-[-0.04em] italic">
        HodL
      </div>
    </footer>
  );
}
