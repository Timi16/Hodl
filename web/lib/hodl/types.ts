/** Contract statuses, exactly as stored on-chain. */
export type ContractStatus = "Created" | "Funded" | "Released" | "Refunded" | "Expired";

/**
 * One escrow, JSON-safe so the same shape works in React Query caches and
 * API responses. Amounts are strings of the token's smallest unit.
 */
export interface Escrow {
  id: number;
  payer: string;
  recipient: string;
  token: string;
  amount: string;
  /** Ledger timestamp, seconds. */
  deadline: number;
  title: string;
  terms: string;
  status: ContractStatus;
  /** What the contract reported at read time (Expired once past the deadline). */
  effectiveStatus: ContractStatus;
  createdAt: number;
  createdLedger: number;
  fundedAt: number;
  closedAt: number;
}

export type EscrowAction = "created" | "funded" | "released" | "refunded" | "expired";

/** One contract event, i.e. one receipt in an escrow's history. */
export interface EscrowEvent {
  id: string;
  escrowId: number;
  action: EscrowAction;
  txHash: string;
  ledger: number;
  /** Ledger close time, seconds. */
  at: number;
  payer?: string;
  recipient?: string;
  amount?: string;
  deadline?: number;
}

export interface EscrowHistory {
  events: EscrowEvent[];
  /** True when the escrow is older than the RPC's event window. */
  truncated: boolean;
}

export interface ContractInfo {
  contractId: string;
  network: string;
  escrowCount: number;
  version: number;
  upgradesEnabled: boolean;
  admin: string;
  usdcAllowed: boolean;
}
