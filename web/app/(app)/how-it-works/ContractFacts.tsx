"use client";

import { CopyButton } from "@/components/ui/motion";
import { Skeleton } from "@/components/ui/primitives";
import { config, explorer } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { useContractInfo } from "@/lib/hooks/queries";

/** Live facts read from the contract itself. */
export function ContractFacts() {
  const info = useContractInfo();
  const d = info.data;
  return (
    <section aria-labelledby="facts" className="grid gap-3 rounded-[30px] border border-white/[0.07] bg-panel p-[clamp(22px,3vw,34px)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="facts" className="font-serif text-[26px]">
          The live contract
        </h2>
        <span className="flex max-w-full min-w-0 items-center gap-1 rounded-xl bg-white/[0.03] py-1 pr-1 pl-3 font-mono text-xs text-muted">
          <a href={explorer.contract()} target="_blank" rel="noreferrer" className="truncate hover:text-paper">
            {config.contractId}
          </a>
          <CopyButton text={config.contractId} label="Copy contract id" />
        </span>
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Fact k="Escrows created" v={d?.escrowCount} />
        <Fact k="Code version" v={d && `v${d.version}`} />
        <Fact k="Network" v={d && "Stellar Testnet"} />
        <Fact k="USDC allowed" v={d && (d.usdcAllowed ? "Yes" : "No")} />
        <Fact k="Upgrades" v={d && (d.upgradesEnabled ? "Enabled" : "Locked for good")} />
        <Fact k="Admin" v={d && shortAddress(d.admin)} mono />
      </dl>
      <p className="text-[13px] leading-relaxed text-faint">
        No admin function can move, freeze or redirect funds. While upgrades are enabled the admin can replace the code,
        UUPS-style; every upgrade is public on-chain, and lock_upgrades makes the code final.
      </p>
    </section>
  );
}

function Fact({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-white/[0.03] px-4 py-3">
      <dt className="text-xs text-faint">{k}</dt>
      <dd className={mono ? "font-mono text-sm" : "font-serif text-2xl"}>{v ?? <Skeleton className="mt-1 h-6 w-16" />}</dd>
    </div>
  );
}
