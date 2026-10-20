import {Address} from '@stellar/stellar-sdk';

    /**
 * Struct: Escrow
 */
export interface Escrow {
  /**
   * Smallest unit of the token (USDC = 7 decimals).
   */
  amount: bigint;
  /**
   * 0 until Released, Refunded or Expired.
   */
  closed_at: bigint;
  created_at: bigint;
  /**
   * Ledger the escrow was created in; where the UI starts scanning events.
   */
  created_ledger: number;
  /**
   * Ledger timestamp, seconds.
   */
  deadline: bigint;
  /**
   * 0 until funded.
   */
  funded_at: bigint;
  id: bigint;
  payer: string;
  recipient: string;
  /**
   * Stored status. See `EscrowView::effective_status` for what to show users.
   */
  status: Status;
  /**
   * Max 500 bytes, what was agreed.
   */
  terms: string;
  /**
   * Max 64 bytes.
   */
  title: string;
  /**
   * Must be on the allowlist when the escrow is created (Testnet USDC SAC).
   */
  token: string;
}

/**
 * Lifecycle of an escrow. Status only ever moves forward:
 *
 * ```text
 * Created ──fund──▶ Funded ──release──▶ Released
 * │                 ├────refund────▶ Refunded
 * │                 └─claim_expired─▶ Expired
 * └───────claim_expired─────────────▶ Expired
 * ```
 */
 export type Status =
  /**
   * Agreement made, nothing locked yet.
   */
  { tag: "Created"; values: void } |
  /**
   * The amount is locked in the contract.
   */
  { tag: "Funded"; values: void } |
  /**
   * Paid out to the recipient. Final.
   */
  { tag: "Released"; values: void } |
  /**
   * Sent back to the payer by the recipient. Final.
   */
  { tag: "Refunded"; values: void } |
  /**
   * Closed after the deadline; any locked funds went back to the payer. Final.
   */
  { tag: "Expired"; values: void };

/**
 * What read calls return: the stored escrow plus the status a user should see.
 *
 * `effective_status` is `Expired` when the stored status is `Created` or
 * `Funded` and the deadline has passed, so no cron job is needed to expire
 * escrows. Funds stay locked until someone calls `claim_expired` (payer),
 * `release` (payer) or `refund` (recipient).
 */
export interface EscrowView {
  effective_status: Status;
  escrow: Escrow;
}

/**
 * Contract error codes. The frontend maps each code to a plain message.
 *
 * Unauthorized callers never reach these: `require_auth()` fails first and
 * the transaction aborts with a host auth error.
 */
export const Error = {
  /**
   * No escrow with this id.
   */
  1 : { message: "NotFound" },
  /**
   * The escrow is not in a status that allows this action
   * (duplicate release or refund, funding twice, acting on a closed escrow).
   */
  2 : { message: "InvalidStatus" },
  /**
   * Amount must be greater than zero.
   */
  3 : { message: "InvalidAmount" },
  /**
   * Payer and recipient must be different addresses.
   */
  4 : { message: "SameParty" },
  /**
   * Deadline must be in the future when creating.
   */
  5 : { message: "DeadlineInPast" },
  /**
   * Tried to fund at or after the deadline.
   */
  6 : { message: "DeadlinePassed" },
  /**
   * Tried to claim before the deadline.
   */
  7 : { message: "DeadlineNotReached" },
  /**
   * Token is not on the allowlist.
   */
  8 : { message: "TokenNotAllowed" },
  /**
   * Title is longer than 64 bytes.
   */
  9 : { message: "TitleTooLong" },
  /**
   * Terms are longer than 500 bytes.
   */
  10 : { message: "TermsTooLong" },
  /**
   * `lock_upgrades` has run, so the code can no longer change.
   */
  11 : { message: "UpgradesLocked" },
  /**
   * `accept_admin` was called with no admin proposed.
   */
  12 : { message: "NoPendingAdmin" }
}

/**
 * Event: Funded
 */
export interface FundedEvent {
  name: "Funded";
  data: {
    id: bigint;
    payer?: string;
    amount?: bigint;
  };
}

/**
 * Event: Created
 */
export interface CreatedEvent {
  name: "Created";
  data: {
    id: bigint;
    payer?: string;
    recipient?: string;
    token?: string;
    amount?: bigint;
    deadline?: bigint;
  };
}

/**
 * Event: Expired
 */
export interface ExpiredEvent {
  name: "Expired";
  data: {
    id: bigint;
    payer?: string;
    /**
     * Amount returned to the payer; 0 if the escrow was never funded.
     */
    amount?: bigint;
  };
}

/**
 * Event: Refunded
 */
export interface RefundedEvent {
  name: "Refunded";
  data: {
    id: bigint;
    payer?: string;
    amount?: bigint;
  };
}

/**
 * Event: Released
 */
export interface ReleasedEvent {
  name: "Released";
  data: {
    id: bigint;
    recipient?: string;
    amount?: bigint;
  };
}

/**
 * The code is being replaced. Topics: `("hodl", "upgraded")`.
 */
export interface UpgradedEvent {
  name: "Upgraded";
  data: {
    new_wasm_hash?: Uint8Array;
    /**
     * Version of the code that performed the upgrade.
     */
    from_version?: number;
  };
}

/**
 * Allowlist changes, so anyone can audit what the admin did.
 * Topics: `("hodl", "token_added", token)`.
 */
export interface TokenAddedEvent {
  name: "TokenAdded";
  data: {
    token: string;
  };
}

/**
 * Topics: `("hodl", "admin_changed", new_admin)`.
 */
export interface AdminChangedEvent {
  name: "AdminChanged";
  data: {
    new_admin: string;
    previous_admin?: string;
  };
}

/**
 * Topics: `("hodl", "token_removed", token)`.
 */
export interface TokenRemovedEvent {
  name: "TokenRemoved";
  data: {
    token: string;
  };
}

/**
 * Topics: `("hodl", "admin_proposed", new_admin)`.
 */
export interface AdminProposedEvent {
  name: "AdminProposed";
  data: {
    new_admin: string;
  };
}

/**
 * Upgrades are now permanently disabled. Topics: `("hodl", "upgrades_locked")`.
 */
export interface UpgradesLockedEvent {
  name: "UpgradesLocked";
  data: {

  };
}
    export type ContractEvent = FundedEvent | CreatedEvent | ExpiredEvent | RefundedEvent | ReleasedEvent | UpgradedEvent | TokenAddedEvent | AdminChangedEvent | TokenRemovedEvent | AdminProposedEvent | UpgradesLockedEvent;
    