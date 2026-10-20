//! Typed access to contract storage. Every write extends the TTL of the
//! entries it touches so an escrow cannot be archived mid-deal.

use soroban_sdk::{Address, Env, Vec};

use crate::errors::Error;
use crate::types::{DataKey, Escrow};

/// ~5 second ledgers.
const DAY_IN_LEDGERS: u32 = 17_280;

/// Instance storage (admin, allowlist, id counter) lives as long as the contract.
pub const INSTANCE_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;
pub const INSTANCE_THRESHOLD: u32 = INSTANCE_EXTEND_TO - DAY_IN_LEDGERS;

/// Escrows and index lists. Kept below Testnet's max entry TTL (~180 days).
pub const PERSISTENT_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;
pub const PERSISTENT_THRESHOLD: u32 = PERSISTENT_EXTEND_TO - 30 * DAY_IN_LEDGERS;

pub fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_EXTEND_TO);
}

fn extend_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_THRESHOLD, PERSISTENT_EXTEND_TO);
}

// ---------------------------------------------------------------- admin

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn admin(env: &Env) -> Address {
    // Set in the constructor, so it is always present.
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn pending_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::PendingAdmin)
}

pub fn set_pending_admin(env: &Env, addr: &Address) {
    env.storage().instance().set(&DataKey::PendingAdmin, addr);
}

pub fn clear_pending_admin(env: &Env) {
    env.storage().instance().remove(&DataKey::PendingAdmin);
}

// ------------------------------------------------------------- upgrades

pub fn upgrades_locked(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::UpgradesLocked)
        .unwrap_or(false)
}

pub fn lock_upgrades(env: &Env) {
    env.storage()
        .instance()
        .set(&DataKey::UpgradesLocked, &true);
}

// ------------------------------------------------------------ allowlist

pub fn is_token_allowed(env: &Env, token: &Address) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::AllowedToken(token.clone()))
        .unwrap_or(false)
}

pub fn allow_token(env: &Env, token: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::AllowedToken(token.clone()), &true);
}

pub fn disallow_token(env: &Env, token: &Address) {
    env.storage()
        .instance()
        .remove(&DataKey::AllowedToken(token.clone()));
}

// -------------------------------------------------------------- escrows

/// Hands out the next escrow id. Ids start at 1, so 0 is never a valid id.
pub fn take_next_id(env: &Env) -> u64 {
    let id = peek_next_id(env);
    env.storage().instance().set(&DataKey::NextId, &(id + 1));
    id
}

pub fn peek_next_id(env: &Env) -> u64 {
    env.storage().instance().get(&DataKey::NextId).unwrap_or(1)
}

pub fn try_load(env: &Env, id: u64) -> Option<Escrow> {
    env.storage().persistent().get(&DataKey::Escrow(id))
}

pub fn load(env: &Env, id: u64) -> Result<Escrow, Error> {
    try_load(env, id).ok_or(Error::NotFound)
}

pub fn save(env: &Env, escrow: &Escrow) {
    let key = DataKey::Escrow(escrow.id);
    env.storage().persistent().set(&key, escrow);
    extend_persistent(env, &key);
}

// ---------------------------------------------------------- index lists

pub fn payer_ids(env: &Env, addr: &Address) -> Vec<u64> {
    ids(env, &DataKey::ByPayer(addr.clone()))
}

pub fn recipient_ids(env: &Env, addr: &Address) -> Vec<u64> {
    ids(env, &DataKey::ByRecipient(addr.clone()))
}

/// Adds the id to both parties' lists. Ids are appended in creation order.
pub fn index(env: &Env, escrow: &Escrow) {
    push_id(env, DataKey::ByPayer(escrow.payer.clone()), escrow.id);
    push_id(
        env,
        DataKey::ByRecipient(escrow.recipient.clone()),
        escrow.id,
    );
}

fn ids(env: &Env, key: &DataKey) -> Vec<u64> {
    env.storage()
        .persistent()
        .get(key)
        .unwrap_or_else(|| Vec::new(env))
}

fn push_id(env: &Env, key: DataKey, id: u64) {
    let mut list = ids(env, &key);
    list.push_back(id);
    env.storage().persistent().set(&key, &list);
    extend_persistent(env, &key);
}
