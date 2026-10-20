//! Test-only stand-in for "hodl-escrow v2".
//!
//! hodl-escrow's upgrade tests upgrade a live escrow contract to this wasm and
//! check that the address, storage and locked funds all survive. It reads the
//! escrow counter through the same storage key, so it proves storage carried
//! over. Never deploy it.
//!
//! Rebuild the committed wasm after changing this file:
//!   stellar contract build --package hodl-upgrade-fixture
//!   cp target/wasm32v1-none/release/hodl_upgrade_fixture.wasm contracts/hodl-escrow/testdata/upgrade_fixture.wasm

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Env};

/// Encodes exactly like hodl-escrow's `DataKey::NextId`: a unit variant is
/// stored as `[Symbol("NextId")]`.
#[contracttype]
enum DataKey {
    NextId,
}

#[contract]
pub struct UpgradeFixture;

#[contractimpl]
impl UpgradeFixture {
    pub fn version() -> u32 {
        2
    }

    pub fn escrow_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get::<_, u64>(&DataKey::NextId)
            .unwrap_or(1)
            - 1
    }
}
