use soroban_sdk::contracterror;

/// Contract error codes. The frontend maps each code to a plain message.
///
/// Unauthorized callers never reach these: `require_auth()` fails first and
/// the transaction aborts with a host auth error.
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// No escrow with this id.
    NotFound = 1,
    /// The escrow is not in a status that allows this action
    /// (duplicate release or refund, funding twice, acting on a closed escrow).
    InvalidStatus = 2,
    /// Amount must be greater than zero.
    InvalidAmount = 3,
    /// Payer and recipient must be different addresses.
    SameParty = 4,
    /// Deadline must be in the future when creating.
    DeadlineInPast = 5,
    /// Tried to fund at or after the deadline.
    DeadlinePassed = 6,
    /// Tried to claim before the deadline.
    DeadlineNotReached = 7,
    /// Token is not on the allowlist.
    TokenNotAllowed = 8,
    /// Title is longer than 64 bytes.
    TitleTooLong = 9,
    /// Terms are longer than 500 bytes.
    TermsTooLong = 10,
    /// `lock_upgrades` has run, so the code can no longer change.
    UpgradesLocked = 11,
    /// `accept_admin` was called with no admin proposed.
    NoPendingAdmin = 12,
}
