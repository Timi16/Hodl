//! Every state change emits exactly one event.
//!
//! Escrow events have topics `("hodl", <action>, id)` so the UI can fetch one
//! escrow's history with a single RPC `getEvents` filter: `("hodl", *, id)`.
//! Data is a map keyed by field name, carrying what the timeline needs.

use soroban_sdk::{contractevent, Address, BytesN, Env};

#[contractevent(topics = ["hodl", "created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Created {
    #[topic]
    pub id: u64,
    pub payer: Address,
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
    pub deadline: u64,
}

#[contractevent(topics = ["hodl", "funded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Funded {
    #[topic]
    pub id: u64,
    pub payer: Address,
    pub amount: i128,
}

#[contractevent(topics = ["hodl", "released"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Released {
    #[topic]
    pub id: u64,
    pub recipient: Address,
    pub amount: i128,
}

#[contractevent(topics = ["hodl", "refunded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub id: u64,
    pub payer: Address,
    pub amount: i128,
}

#[contractevent(topics = ["hodl", "expired"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Expired {
    #[topic]
    pub id: u64,
    pub payer: Address,
    /// Amount returned to the payer; 0 if the escrow was never funded.
    pub amount: i128,
}

/// Allowlist changes, so anyone can audit what the admin did.
/// Topics: `("hodl", "token_added", token)`.
#[contractevent(topics = ["hodl", "token_added"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenAdded {
    #[topic]
    pub token: Address,
}

/// Topics: `("hodl", "token_removed", token)`.
#[contractevent(topics = ["hodl", "token_removed"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenRemoved {
    #[topic]
    pub token: Address,
}

/// The code is being replaced. Topics: `("hodl", "upgraded")`.
#[contractevent(topics = ["hodl", "upgraded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Upgraded {
    pub new_wasm_hash: BytesN<32>,
    /// Version of the code that performed the upgrade.
    pub from_version: u32,
}

/// Upgrades are now permanently disabled. Topics: `("hodl", "upgrades_locked")`.
#[contractevent(topics = ["hodl", "upgrades_locked"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradesLocked {}

/// Topics: `("hodl", "admin_proposed", new_admin)`.
#[contractevent(topics = ["hodl", "admin_proposed"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminProposed {
    #[topic]
    pub new_admin: Address,
}

/// Topics: `("hodl", "admin_changed", new_admin)`.
#[contractevent(topics = ["hodl", "admin_changed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminChanged {
    #[topic]
    pub new_admin: Address,
    pub previous_admin: Address,
}

pub fn created(
    env: &Env,
    id: u64,
    payer: &Address,
    recipient: &Address,
    token: &Address,
    amount: i128,
    deadline: u64,
) {
    Created {
        id,
        payer: payer.clone(),
        recipient: recipient.clone(),
        token: token.clone(),
        amount,
        deadline,
    }
    .publish(env);
}

pub fn funded(env: &Env, id: u64, payer: &Address, amount: i128) {
    Funded {
        id,
        payer: payer.clone(),
        amount,
    }
    .publish(env);
}

pub fn released(env: &Env, id: u64, recipient: &Address, amount: i128) {
    Released {
        id,
        recipient: recipient.clone(),
        amount,
    }
    .publish(env);
}

pub fn refunded(env: &Env, id: u64, payer: &Address, amount: i128) {
    Refunded {
        id,
        payer: payer.clone(),
        amount,
    }
    .publish(env);
}

pub fn expired(env: &Env, id: u64, payer: &Address, amount: i128) {
    Expired {
        id,
        payer: payer.clone(),
        amount,
    }
    .publish(env);
}

pub fn token_added(env: &Env, token: &Address) {
    TokenAdded {
        token: token.clone(),
    }
    .publish(env);
}

pub fn token_removed(env: &Env, token: &Address) {
    TokenRemoved {
        token: token.clone(),
    }
    .publish(env);
}

pub fn upgraded(env: &Env, new_wasm_hash: &BytesN<32>, from_version: u32) {
    Upgraded {
        new_wasm_hash: new_wasm_hash.clone(),
        from_version,
    }
    .publish(env);
}

pub fn upgrades_locked(env: &Env) {
    UpgradesLocked {}.publish(env);
}

pub fn admin_proposed(env: &Env, new_admin: &Address) {
    AdminProposed {
        new_admin: new_admin.clone(),
    }
    .publish(env);
}

pub fn admin_changed(env: &Env, new_admin: &Address, previous_admin: &Address) {
    AdminChanged {
        new_admin: new_admin.clone(),
        previous_admin: previous_admin.clone(),
    }
    .publish(env);
}
