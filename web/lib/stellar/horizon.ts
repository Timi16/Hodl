import { config } from "../config";

export interface Readiness {
  /** The account exists on the network (has been funded with XLM). */
  exists: boolean;
  xlm: string | null;
  /** USDC balance, or null if there is no trustline. */
  usdc: string | null;
}

interface HorizonBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

export async function getReadiness(address: string): Promise<Readiness> {
  // `?signer=` answers 200 with an empty list for an unfunded account, where
  // /accounts/:id answers 404, which browsers log as a console error on every poll.
  const res = await fetch(`${config.horizonUrl}/accounts?signer=${address}&limit=200`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Horizon responded ${res.status}`);
  const page = (await res.json()) as { _embedded: { records: { id: string; balances: HorizonBalance[] }[] } };
  // Other accounts can list this key as a signer; only its own account counts.
  const account = page._embedded.records.find((r) => r.id === address);
  if (!account) return { exists: false, xlm: null, usdc: null };
  const xlm = account.balances.find((b) => b.asset_type === "native")?.balance ?? null;
  const usdc =
    account.balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === config.usdcIssuer)?.balance ??
    null;
  return { exists: true, xlm, usdc };
}
