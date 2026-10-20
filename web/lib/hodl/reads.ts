/**
 * Contract reads. Runs in the browser (live data through React Query) and on
 * the server (API routes, share cards), so it only touches public RPC.
 */
import { config } from "../config";
import { SimulationError, sc, view } from "../stellar/rpc";
import type { ContractInfo, ContractStatus, Escrow } from "./types";

interface RawEscrow {
  id: bigint;
  payer: string;
  recipient: string;
  token: string;
  amount: bigint;
  deadline: bigint;
  title: string;
  terms: string;
  status: [ContractStatus] | ContractStatus;
  created_at: bigint;
  created_ledger: number;
  funded_at: bigint;
  closed_at: bigint;
}
interface RawView {
  escrow: RawEscrow;
  effective_status: [ContractStatus] | ContractStatus;
}

// Unit enum variants decode as ["Funded"].
const statusOf = (s: [ContractStatus] | ContractStatus): ContractStatus =>
  Array.isArray(s) ? s[0] : s;

function toEscrow(v: RawView): Escrow {
  const e = v.escrow;
  return {
    id: Number(e.id),
    payer: e.payer,
    recipient: e.recipient,
    token: e.token,
    amount: e.amount.toString(),
    deadline: Number(e.deadline),
    title: e.title,
    terms: e.terms,
    status: statusOf(e.status),
    effectiveStatus: statusOf(v.effective_status),
    createdAt: Number(e.created_at),
    createdLedger: Number(e.created_ledger),
    fundedAt: Number(e.funded_at),
    closedAt: Number(e.closed_at),
  };
}

/** One escrow, or null if the id doesn't exist. */
export async function getEscrow(id: number): Promise<Escrow | null> {
  try {
    return toEscrow(await view<RawView>("get_escrow", [sc.u64(id)]));
  } catch (err) {
    if (err instanceof SimulationError && /Error\(Contract, #1\)/.test(err.message)) return null;
    throw err;
  }
}

/** Batch read in the order given; unknown ids are skipped. Chunked to stay in budget. */
export async function getEscrows(ids: number[]): Promise<Escrow[]> {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += 25) chunks.push(ids.slice(i, i + 25));
  const results = await Promise.all(
    chunks.map((chunk) => view<RawView[]>("get_escrows", [sc.u64Vec(chunk)])),
  );
  return results.flat().map(toEscrow);
}

/** Escrow ids where the address pays and where it receives, oldest first. */
export async function getUserEscrowIds(address: string): Promise<{ paying: number[]; receiving: number[] }> {
  const [paying, receiving] = await view<[bigint[], bigint[]]>("get_user_escrows", [sc.address(address)]);
  return { paying: paying.map(Number), receiving: receiving.map(Number) };
}

export async function getContractInfo(): Promise<ContractInfo> {
  const [escrowCount, version, upgradesEnabled, admin, usdcAllowed] = await Promise.all([
    view<bigint>("escrow_count"),
    view<number>("version"),
    view<boolean>("upgrades_enabled"),
    view<string>("admin"),
    view<boolean>("is_token_allowed", [sc.address(config.usdcSacId)]),
  ]);
  return {
    contractId: config.contractId,
    network: config.network,
    escrowCount: Number(escrowCount),
    version: Number(version),
    upgradesEnabled,
    admin,
    usdcAllowed,
  };
}
