//! # hodl-escrow
//!
//! A non-custodial escrow for Stellar Asset Contract tokens (Testnet USDC).
//!
//! One contract holds every escrow and all locked funds. Status only moves
//! forward, and every function checks the current status before doing
//! anything, which is what blocks duplicate releases and refunds.
//!
//! Every money-moving function follows the same order:
//! **load → auth → status check → write state → transfer → event.**
//!
//! Guarantees:
//! - Funds only ever go to the escrow's own payer or recipient. No function
//!   takes a destination address.
//! - No admin function moves, freezes or redirects funds. The admin edits the
//!   token allowlist and can upgrade the code.
//! - Removing a token from the allowlist only blocks new escrows; existing
//!   escrows in that token can still be funded, released, refunded and claimed.
//!
//! Upgrades work like Solidity's UUPS: the upgrade function lives in the
//! contract itself, and `upgrade` swaps the wasm while the address, storage
//! and locked funds stay put. Because new code could do anything, the admin
//! is trusted for upgrades until `lock_upgrades` freezes the code for good.
//! Admin handover is two-step (`propose_admin`, then `accept_admin`).

#![no_std]
// `create` and `create_and_fund` take the seven escrow fields directly so the
// generated clients and Stellar Lab show one plain argument per field. The
// lint also fires on the code `#[contractimpl]` generates, so allow it here.
#![allow(clippy::too_many_arguments)]

mod errors;
mod events;
mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contractimpl, token, Address, BytesN, ContractExecutable, Env, String, Vec,
};

pub use errors::Error;
pub use types::{DataKey, Escrow, EscrowView, Status};

pub const MAX_TITLE_LEN: u32 = 64;
pub const MAX_TERMS_LEN: u32 = 500;

/// Bumped with every release of this code. A version that changes the storage
/// layout ships its own admin-only `migrate` function, run right after `upgrade`.
pub const VERSION: u32 = 1;

#[contract]
pub struct HodlEscrow;

#[contractimpl]
impl HodlEscrow {
    /// Runs once, atomically with deploy. Sets the allowlist admin and
    /// allowlists the USDC Stellar Asset Contract.
    pub fn __constructor(env: Env, admin: Address, usdc: Address) {
        storage::set_admin(&env, &admin);
        storage::allow_token(&env, &usdc);
        storage::extend_instance(&env);
        events::token_added(&env, &usdc);
    }

    // ================================================================ writes

    /// Creates an escrow in `Created` status. Nothing is locked yet; call
    /// `fund` next, or use `create_and_fund` to do both in one transaction.
    ///
    /// Signer: `payer`. Returns the new escrow id.
    pub fn create(
        env: Env,
        payer: Address,
        recipient: Address,
        token: Address,
        amount: i128,
        deadline: u64,
        title: String,
        terms: String,
    ) -> Result<u64, Error> {
        payer.require_auth();
        let escrow = Self::new_escrow(
            &env, payer, recipient, token, amount, deadline, title, terms,
        )?;
        Ok(escrow.id)
    }

    /// Locks the escrow amount: payer → contract. Status becomes `Funded`.
    ///
    /// Signer: `payer`. Allowed when `Created` and before the deadline.
    pub fn fund(env: Env, id: u64) -> Result<(), Error> {
        storage::extend_instance(&env);
        let mut escrow = storage::load(&env, id)?;
        escrow.payer.require_auth();
        if escrow.status != Status::Created {
            return Err(Error::InvalidStatus);
        }
        if env.ledger().timestamp() >= escrow.deadline {
            return Err(Error::DeadlinePassed);
        }
        Self::lock_funds(&env, &mut escrow);
        Ok(())
    }

    /// `create` and `fund` in one transaction with one signature. This is
    /// the default path in the UI.
    ///
    /// Signer: `payer`. Returns the new escrow id.
    pub fn create_and_fund(
        env: Env,
        payer: Address,
        recipient: Address,
        token: Address,
        amount: i128,
        deadline: u64,
        title: String,
        terms: String,
    ) -> Result<u64, Error> {
        payer.require_auth();
        // `new_escrow` guarantees status `Created` and `deadline > now`,
        // which is exactly what `fund` checks.
        let mut escrow = Self::new_escrow(
            &env, payer, recipient, token, amount, deadline, title, terms,
        )?;
        Self::lock_funds(&env, &mut escrow);
        Ok(escrow.id)
    }

    /// Pays the locked amount to the recipient: contract → recipient.
    /// Status becomes `Released`. Final.
    ///
    /// Signer: `payer`. Allowed when `Funded`, including after the deadline
    /// ("release anyway").
    pub fn release(env: Env, id: u64) -> Result<(), Error> {
        storage::extend_instance(&env);
        let mut escrow = storage::load(&env, id)?;
        escrow.payer.require_auth();
        if escrow.status != Status::Funded {
            return Err(Error::InvalidStatus);
        }
        Self::close(&env, &mut escrow, Status::Released);
        Self::pay_out(&env, &escrow.token, &escrow.recipient, escrow.amount);
        events::released(&env, id, &escrow.recipient, escrow.amount);
        Ok(())
    }

    /// The recipient sends the locked amount back: contract → payer.
    /// Status becomes `Refunded`. Final.
    ///
    /// Signer: `recipient`. Allowed when `Funded`, including after the deadline.
    pub fn refund(env: Env, id: u64) -> Result<(), Error> {
        storage::extend_instance(&env);
        let mut escrow = storage::load(&env, id)?;
        escrow.recipient.require_auth();
        if escrow.status != Status::Funded {
            return Err(Error::InvalidStatus);
        }
        Self::close(&env, &mut escrow, Status::Refunded);
        Self::pay_out(&env, &escrow.token, &escrow.payer, escrow.amount);
        events::refunded(&env, id, &escrow.payer, escrow.amount);
        Ok(())
    }

    /// Closes an escrow whose deadline has passed. If it was funded, the
    /// locked amount goes back to the payer. Status becomes `Expired`. Final.
    ///
    /// Signer: `payer`. Allowed when `Created` or `Funded`, at or after the
    /// deadline.
    pub fn claim_expired(env: Env, id: u64) -> Result<(), Error> {
        storage::extend_instance(&env);
        let mut escrow = storage::load(&env, id)?;
        escrow.payer.require_auth();
        let returned = match escrow.status {
            Status::Created => 0,
            Status::Funded => escrow.amount,
            _ => return Err(Error::InvalidStatus),
        };
        if env.ledger().timestamp() < escrow.deadline {
            return Err(Error::DeadlineNotReached);
        }
        Self::close(&env, &mut escrow, Status::Expired);
        if returned > 0 {
            Self::pay_out(&env, &escrow.token, &escrow.payer, returned);
        }
        events::expired(&env, id, &escrow.payer, returned);
        Ok(())
    }

    // ================================================================= reads

    /// One escrow plus its `effective_status`.
    pub fn get_escrow(env: Env, id: u64) -> Result<EscrowView, Error> {
        let escrow = storage::load(&env, id)?;
        Ok(Self::view(&env, escrow))
    }

    /// Batch read for the dashboard, in the order given. Ids that do not
    /// exist are skipped rather than failing the whole call.
    pub fn get_escrows(env: Env, ids: Vec<u64>) -> Vec<EscrowView> {
        let mut out = Vec::new(&env);
        for id in ids.iter() {
            if let Some(escrow) = storage::try_load(&env, id) {
                out.push_back(Self::view(&env, escrow));
            }
        }
        out
    }

    /// `(paying, receiving)` escrow ids for an address, oldest first.
    pub fn get_user_escrows(env: Env, addr: Address) -> (Vec<u64>, Vec<u64>) {
        (
            storage::payer_ids(&env, &addr),
            storage::recipient_ids(&env, &addr),
        )
    }

    /// Number of escrows ever created. Ids run from 1 to this value.
    pub fn escrow_count(env: Env) -> u64 {
        storage::peek_next_id(&env) - 1
    }

    /// Whether new escrows may be created in `token`.
    pub fn is_token_allowed(env: Env, token: Address) -> bool {
        storage::is_token_allowed(&env, &token)
    }

    /// The admin: edits the allowlist and authorizes upgrades.
    pub fn admin(env: Env) -> Address {
        storage::admin(&env)
    }

    /// The address `propose_admin` named, until it calls `accept_admin`.
    pub fn pending_admin(env: Env) -> Option<Address> {
        storage::pending_admin(&env)
    }

    /// Version of the code currently running.
    pub fn version() -> u32 {
        VERSION
    }

    /// `false` once `lock_upgrades` has been called; the code is then final.
    pub fn upgrades_enabled(env: Env) -> bool {
        !storage::upgrades_locked(&env)
    }

    // ================================================================= admin

    /// Allowlists a token for new escrows. Signer: admin.
    pub fn add_token(env: Env, token: Address) {
        storage::extend_instance(&env);
        storage::admin(&env).require_auth();
        storage::allow_token(&env, &token);
        events::token_added(&env, &token);
    }

    /// Removes a token from the allowlist. Only blocks new escrows; existing
    /// ones are unaffected. Signer: admin.
    pub fn remove_token(env: Env, token: Address) {
        storage::extend_instance(&env);
        storage::admin(&env).require_auth();
        storage::disallow_token(&env, &token);
        events::token_removed(&env, &token);
    }

    // ============================================================== upgrades

    /// Replaces this contract's code with already-uploaded wasm, like UUPS
    /// `upgradeTo`. The address, all storage and all locked funds stay the
    /// same; the new code runs from the next call. Signer: admin.
    ///
    /// Upload the wasm first (`stellar contract upload`) and pass its hash.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        storage::extend_instance(&env);
        storage::admin(&env).require_auth();
        if storage::upgrades_locked(&env) {
            return Err(Error::UpgradesLocked);
        }
        events::upgraded(&env, &new_wasm_hash, VERSION);
        env.deployer()
            .update_current_contract(ContractExecutable::Wasm(new_wasm_hash));
        Ok(())
    }

    /// Freezes the code permanently: `upgrade` fails from now on, for every
    /// admin. Cannot be undone. Signer: admin.
    pub fn lock_upgrades(env: Env) -> Result<(), Error> {
        storage::extend_instance(&env);
        storage::admin(&env).require_auth();
        if storage::upgrades_locked(&env) {
            return Err(Error::UpgradesLocked);
        }
        storage::lock_upgrades(&env);
        events::upgrades_locked(&env);
        Ok(())
    }

    /// Step one of an admin handover. Nothing changes until `new_admin` calls
    /// `accept_admin`, so a typo cannot lose the admin role. Proposing again
    /// replaces the pending admin. Signer: current admin.
    pub fn propose_admin(env: Env, new_admin: Address) {
        storage::extend_instance(&env);
        storage::admin(&env).require_auth();
        storage::set_pending_admin(&env, &new_admin);
        events::admin_proposed(&env, &new_admin);
    }

    /// Step two of an admin handover. Signer: the pending admin.
    pub fn accept_admin(env: Env) -> Result<(), Error> {
        storage::extend_instance(&env);
        let new_admin = storage::pending_admin(&env).ok_or(Error::NoPendingAdmin)?;
        new_admin.require_auth();
        let previous = storage::admin(&env);
        storage::set_admin(&env, &new_admin);
        storage::clear_pending_admin(&env);
        events::admin_changed(&env, &new_admin, &previous);
        Ok(())
    }
}

// Internal helpers. Not part of the contract interface.
impl HodlEscrow {
    /// Validates, stores and indexes a new escrow, then emits `created`.
    /// The caller must have already called `payer.require_auth()`.
    fn new_escrow(
        env: &Env,
        payer: Address,
        recipient: Address,
        token: Address,
        amount: i128,
        deadline: u64,
        title: String,
        terms: String,
    ) -> Result<Escrow, Error> {
        storage::extend_instance(env);
        let now = env.ledger().timestamp();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if payer == recipient {
            return Err(Error::SameParty);
        }
        if deadline <= now {
            return Err(Error::DeadlineInPast);
        }
        if !storage::is_token_allowed(env, &token) {
            return Err(Error::TokenNotAllowed);
        }
        if title.len() > MAX_TITLE_LEN {
            return Err(Error::TitleTooLong);
        }
        if terms.len() > MAX_TERMS_LEN {
            return Err(Error::TermsTooLong);
        }

        let escrow = Escrow {
            id: storage::take_next_id(env),
            payer,
            recipient,
            token,
            amount,
            deadline,
            title,
            terms,
            status: Status::Created,
            created_at: now,
            created_ledger: env.ledger().sequence(),
            funded_at: 0,
            closed_at: 0,
        };
        storage::save(env, &escrow);
        storage::index(env, &escrow);
        events::created(
            env,
            escrow.id,
            &escrow.payer,
            &escrow.recipient,
            &escrow.token,
            escrow.amount,
            escrow.deadline,
        );
        Ok(escrow)
    }

    /// Marks the escrow `Funded`, then pulls the amount from the payer.
    /// The caller must have checked auth, status and deadline.
    fn lock_funds(env: &Env, escrow: &mut Escrow) {
        escrow.status = Status::Funded;
        escrow.funded_at = env.ledger().timestamp();
        storage::save(env, escrow);
        token::Client::new(env, &escrow.token).transfer(
            &escrow.payer,
            env.current_contract_address(),
            &escrow.amount,
        );
        events::funded(env, escrow.id, &escrow.payer, escrow.amount);
    }

    /// Moves the escrow to a final status and saves it, before any transfer.
    fn close(env: &Env, escrow: &mut Escrow, status: Status) {
        escrow.status = status;
        escrow.closed_at = env.ledger().timestamp();
        storage::save(env, escrow);
    }

    /// Sends funds held by this contract to `to`, which is always the
    /// escrow's own payer or recipient.
    fn pay_out(env: &Env, token: &Address, to: &Address, amount: i128) {
        token::Client::new(env, token).transfer(&env.current_contract_address(), to, &amount);
    }

    fn view(env: &Env, escrow: Escrow) -> EscrowView {
        let open = matches!(escrow.status, Status::Created | Status::Funded);
        let effective_status = if open && env.ledger().timestamp() >= escrow.deadline {
            Status::Expired
        } else {
            escrow.status
        };
        EscrowView {
            escrow,
            effective_status,
        }
    }
}
