use soroban_sdk::{contracttype, Address, String};

/// Lifecycle of an escrow. Status only ever moves forward:
///
/// ```text
/// Created ──fund──▶ Funded ──release──▶ Released
///    │                 ├────refund────▶ Refunded
///    │                 └─claim_expired─▶ Expired
///    └───────claim_expired─────────────▶ Expired
/// ```
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    /// Agreement made, nothing locked yet.
    Created,
    /// The amount is locked in the contract.
    Funded,
    /// Paid out to the recipient. Final.
    Released,
    /// Sent back to the payer by the recipient. Final.
    Refunded,
    /// Closed after the deadline; any locked funds went back to the payer. Final.
    Expired,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub id: u64,
    pub payer: Address,
    pub recipient: Address,
    /// Must be on the allowlist when the escrow is created (Testnet USDC SAC).
    pub token: Address,
    /// Smallest unit of the token (USDC = 7 decimals).
    pub amount: i128,
    /// Ledger timestamp, seconds.
    pub deadline: u64,
    /// Max 64 bytes.
    pub title: String,
    /// Max 500 bytes, what was agreed.
    pub terms: String,
    /// Stored status. See `EscrowView::effective_status` for what to show users.
    pub status: Status,
    pub created_at: u64,
    /// Ledger the escrow was created in; where the UI starts scanning events.
    pub created_ledger: u32,
    /// 0 until funded.
    pub funded_at: u64,
    /// 0 until Released, Refunded or Expired.
    pub closed_at: u64,
}

/// What read calls return: the stored escrow plus the status a user should see.
///
/// `effective_status` is `Expired` when the stored status is `Created` or
/// `Funded` and the deadline has passed, so no cron job is needed to expire
/// escrows. Funds stay locked until someone calls `claim_expired` (payer),
/// `release` (payer) or `refund` (recipient).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowView {
    pub escrow: Escrow,
    pub effective_status: Status,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Instance. Address that can edit the token allowlist (cannot touch funds).
    Admin,
    /// Instance. `true` for each accepted token.
    AllowedToken(Address),
    /// Instance. Next escrow id to hand out. Ids start at 1.
    NextId,
    /// Persistent. The `Escrow` struct.
    Escrow(u64),
    /// Persistent. `Vec<u64>` of escrow ids where the address pays.
    ByPayer(Address),
    /// Persistent. `Vec<u64>` of escrow ids where the address receives.
    ByRecipient(Address),
    /// Instance. Address named by `propose_admin`, until it accepts.
    PendingAdmin,
    /// Instance. `true` once `lock_upgrades` has run. Never cleared.
    UpgradesLocked,
}
