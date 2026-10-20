import type { Metadata } from "next";
import { Reveal } from "@/components/ui/motion";
import { ExternalIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/primitives";
import { config, explorer } from "@/lib/config";
import { ContractFacts } from "./ContractFacts";
import { StateDiagram } from "./StateDiagram";

export const metadata: Metadata = {
  title: "How it works",
  description: "HodL's state machine, contract functions, live contract and public API, for reviewers.",
};

const FUNCTIONS: [string, string, string, string][] = [
  ["create_and_fund(...)", "Payer", "Amount > 0, not to yourself, deadline in the future", "Creates and locks in one signature"],
  ["create(...)", "Payer", "Same checks", "Saves the terms, locks nothing"],
  ["fund(id)", "Payer", "Not funded, before the deadline", "USDC: payer → contract"],
  ["release(id)", "Payer", "Funded, any time", "USDC: contract → recipient"],
  ["refund(id)", "Recipient", "Funded, any time", "USDC: contract → payer"],
  ["claim_expired(id)", "Payer", "Not settled, at or after the deadline", "Locked USDC back to the payer"],
  ["get_escrow(id)", "Anyone", "Always", "The escrow plus its effective status"],
  ["upgrade(hash) / lock_upgrades()", "Admin", "Until upgrades are locked", "Swaps the code; address and funds stay"],
];

const ROUTES: [string, string][] = [
  ["GET /api/escrow/:id", "One escrow and its phase"],
  ["GET /api/escrow/:id/events", "Its receipts with transaction hashes"],
  ["GET /api/escrows?ids=1,2,3", "Batch read"],
  ["GET /api/users/:address/escrows", "Paying and receiving ids; ?expand=1, ?activity=1"],
  ["GET /api/stats", "Contract id, escrow count, version, upgrade lock"],
  ["GET /api/health", "Soroban RPC and Horizon status"],
  ["POST /api/friendbot", "Funds a Testnet account with XLM"],
];

export default function HowItWorksPage() {
  return (
    <main className="relative mx-auto flex max-w-[1160px] flex-col gap-6 px-[clamp(16px,3vw,32px)] pt-6 pb-24">
      <div className="rise d1 flex max-w-[760px] flex-col gap-3 pt-2">
        <span className="eyebrow text-xs">For reviewers</span>
        <h1 className="font-serif text-[clamp(38px,4.4vw,56px)] leading-none font-normal tracking-[-0.02em]">
          One contract. <em className="text-mint">Five states.</em>
        </h1>
        <p className="text-base leading-relaxed text-muted">
          Everything HodL does is a call on one Soroban contract. Status only moves forward, and every function checks it
          first, which is what stops a release or refund from happening twice.
        </p>
      </div>

      <Reveal>
        <StateDiagram />
      </Reveal>

      <Reveal>
        <ContractFacts />
      </Reveal>

      <Reveal>
        <Panel className="overflow-hidden">
          <h2 className="px-[22px] pt-6 pb-2 font-serif text-[26px]">Functions</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-faint">
                  <th className="px-[22px] py-3 font-medium">Function</th>
                  <th className="px-3 py-3 font-medium">Signer</th>
                  <th className="px-3 py-3 font-medium">Allowed when</th>
                  <th className="px-[22px] py-3 font-medium">Effect</th>
                </tr>
              </thead>
              <tbody>
                {FUNCTIONS.map(([fn, who, when, effect]) => (
                  <tr key={fn} className="row border-t border-white/[0.06]">
                    <td className="px-[22px] py-3.5 font-mono text-[13px] text-mint">{fn}</td>
                    <td className="px-3 py-3.5">{who}</td>
                    <td className="px-3 py-3.5 text-muted">{when}</td>
                    <td className="px-[22px] py-3.5 text-muted">{effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </Reveal>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
        <Reveal>
          <Panel className="flex h-full flex-col gap-4 p-6">
            <h2 className="font-serif text-[26px]">Public API</h2>
            <p className="text-sm text-muted">
              Read-only, keyless and CORS-open JSON, cached for a few seconds. The app itself reads the chain directly, so it
              works without these.
            </p>
            <ul className="flex flex-col gap-2.5">
              {ROUTES.map(([route, what]) => (
                <li key={route} className="flex flex-col gap-0.5 rounded-xl bg-white/[0.03] px-3.5 py-2.5">
                  <span className="font-mono text-[13px] text-paper">{route}</span>
                  <span className="text-xs text-faint">{what}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </Reveal>
        <Reveal>
          <Panel className="flex h-full flex-col gap-4 p-6">
            <h2 className="font-serif text-[26px]">Verify it yourself</h2>
            <ul className="flex flex-col gap-2">
              <VerifyLink href={explorer.contract()} label="The contract on Stellar Expert" />
              <VerifyLink href={`https://lab.stellar.org/r/testnet/contract/${config.contractId}`} label="Call it from Stellar Lab" />
              <VerifyLink href={explorer.contract(config.usdcSacId)} label="Testnet USDC (Circle)" />
              <VerifyLink href={`${config.repoUrl}`} label="Source code and TRANSACTIONS.md" />
            </ul>
            <p className="mt-auto text-[13px] leading-relaxed text-faint">
              Every escrow event carries topics (&quot;hodl&quot;, action, id), so any escrow&apos;s history is one RPC getEvents
              filter.
            </p>
          </Panel>
        </Reveal>
      </div>
    </main>
  );
}

function VerifyLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="row flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/[0.07] px-4 text-sm"
      >
        {label}
        <ExternalIcon size={14} className="text-faint" />
      </a>
    </li>
  );
}
