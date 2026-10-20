# hodl-escrow contract reference

One Soroban contract holds every HodL escrow and all locked USDC. This page is the
reference for the frontend and for reviewers. The design rationale lives in
[Architecture.md](Architecture.md).

| | |
|---|---|
| Network | Stellar Testnet |
| Contract | [`CCBBKXKT2CMMAU7CUQJBFLIECPJQKN3IGDK6EGOS5PQH56HXF4FNLLDB`](https://stellar.expert/explorer/testnet/contract/CCBBKXKT2CMMAU7CUQJBFLIECPJQKN3IGDK6EGOS5PQH56HXF4FNLLDB) |
| Wasm hash | `7f4a927b715740f6e44f6827d0d98a277b4bcc8bafc15a1797431d889926135e` (version 1) |
| Upgrades | Enabled, UUPS-style (see [Upgrades](#upgrades)) |
| USDC SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` (Circle Testnet USDC) |
| Source | [`contracts/hodl-escrow/src`](../contracts/hodl-escrow/src) |
| SDK | `soroban-sdk` 29.0.1 |

After a Testnet reset, `scripts/deploy.sh` prints the new id and writes `deployments/testnet.env`.

## State machine

Status only moves forward, and every closed status is final.

```text
              fund (payer, before deadline)
  Created ───────────────────────────────▶ Funded
     │                                       │
     │                                       ├── release (payer, any time) ──────▶ Released
     │                                       ├── refund (recipient, any time) ───▶ Refunded
     │                                       └── claim_expired (payer, ≥ deadline) ▶ Expired
     │                                                      funds → payer
     └──── claim_expired (payer, ≥ deadline) ──────────────────────────────────▶ Expired
                                                            nothing to return
```

**Effective status.** Reads return `effective_status` next to the stored status. It is
`Expired` whenever the stored status is `Created` or `Funded` and `now ≥ deadline`. Funds
stay locked until someone acts, so a `Funded` escrow past its deadline still allows
`release`, `refund` or `claim_expired`, whichever comes first.

**The deadline second is "expired".** `fund` needs `now < deadline` and `claim_expired`
needs `now ≥ deadline`, so there is never a moment where both or neither are allowed.

## Functions

### Writes

| Function | Signer | Allowed when | Effect | Errors |
|---|---|---|---|---|
| `__constructor(admin, usdc)` | deployer | once, at deploy | Sets admin, allowlists `usdc` | |
| `create(payer, recipient, token, amount, deadline, title, terms) -> u64` | payer | see validation below | New escrow in `Created`; id added to both index lists | 3, 4, 5, 8, 9, 10 |
| `fund(id)` | payer | `Created`, `now < deadline` | `amount` moves payer → contract; `Funded` | 1, 2, 6 |
| `create_and_fund(...same as create) -> u64` | payer | same as `create` | Both in one transaction with one signature | 3, 4, 5, 8, 9, 10 |
| `release(id)` | payer | `Funded` | `amount` moves contract → recipient; `Released` | 1, 2 |
| `refund(id)` | recipient | `Funded` | `amount` moves contract → payer; `Refunded` | 1, 2 |
| `claim_expired(id)` | payer | `Created` or `Funded`, `now ≥ deadline` | If funded, `amount` moves contract → payer; `Expired` | 1, 2, 7 |
| `add_token(token)` | admin | always | Allowlists a token for new escrows | |
| `remove_token(token)` | admin | always | Blocks new escrows in a token; existing ones are unaffected | |
| `upgrade(new_wasm_hash)` | admin | upgrades not locked | Swaps the code; address, storage and funds stay | 11 |
| `lock_upgrades()` | admin | upgrades not locked | Freezes the code forever | 11 |
| `propose_admin(new_admin)` | admin | always | Names the next admin; nothing changes yet | |
| `accept_admin()` | pending admin | an admin was proposed | Pending admin becomes admin | 12 |

`create` validation, checked in this order: `amount > 0` (3), `payer ≠ recipient` (4),
`deadline > now` (5), token allowlisted (8), `title` ≤ 64 bytes (9), `terms` ≤ 500 bytes (10).
Lengths are UTF-8 bytes, not characters, so a `€` counts as 3.

### Reads

These are free to call through simulation (no signature, no fee).

| Function | Returns |
|---|---|
| `get_escrow(id) -> EscrowView` | The escrow plus `effective_status`. Error 1 if unknown. |
| `get_escrows(ids) -> Vec<EscrowView>` | Batch read in the order given. Unknown ids are skipped, not an error. |
| `get_user_escrows(addr) -> (Vec<u64>, Vec<u64>)` | `(paying, receiving)` ids, oldest first. |
| `escrow_count() -> u64` | Escrows ever created. Ids run from 1 to this value, and 0 is never a valid id. |
| `is_token_allowed(token) -> bool` | Whether new escrows may use `token`. |
| `admin() -> Address` | The admin (allowlist and upgrades). |
| `pending_admin() -> Option<Address>` | The proposed admin, until it accepts. |
| `version() -> u32` | Version of the running code (1 today). |
| `upgrades_enabled() -> bool` | `false` once `lock_upgrades` has run. |

### Types

```rust
enum Status { Created, Funded, Released, Refunded, Expired }

struct Escrow {
    id: u64,
    payer: Address,
    recipient: Address,
    token: Address,
    amount: i128,          // smallest unit; USDC has 7 decimals, so 1 USDC = 10_000_000
    deadline: u64,         // ledger timestamp, seconds
    title: String,         // ≤ 64 bytes
    terms: String,         // ≤ 500 bytes
    status: Status,        // stored status
    created_at: u64,
    created_ledger: u32,   // start getEvents scans here
    funded_at: u64,        // 0 until funded
    closed_at: u64,        // 0 until Released / Refunded / Expired
}

struct EscrowView { escrow: Escrow, effective_status: Status }
```

In the TypeScript bindings (`web/contract`), `Status` is `{ tag: "Funded" }` and the u64 and
i128 fields are `bigint`.

## Errors

Unauthorized callers never see these codes. `require_auth()` fails first and the host
aborts the call with an auth error (`Error(Auth, InvalidAction)`), before any contract logic
runs. Treat that as "this wallet can't do this".

| Code | Name | When | Suggested UI message |
|---|---|---|---|
| 1 | `NotFound` | No escrow with this id | "This escrow doesn't exist." |
| 2 | `InvalidStatus` | Duplicate release or refund, funding twice, acting on a closed escrow | "This escrow has already been settled." |
| 3 | `InvalidAmount` | `amount ≤ 0` | "Enter an amount greater than zero." |
| 4 | `SameParty` | `payer = recipient` | "You can't create an escrow to yourself." |
| 5 | `DeadlineInPast` | `deadline ≤ now` at create | "Pick a deadline in the future." |
| 6 | `DeadlinePassed` | `fund` at or after the deadline | "The deadline has passed, so this escrow can't be funded." |
| 7 | `DeadlineNotReached` | `claim_expired` before the deadline | "You can reclaim after the deadline." |
| 8 | `TokenNotAllowed` | Token not on the allowlist | "Only USDC is supported." |
| 9 | `TitleTooLong` | `title` > 64 bytes | "Title is too long." |
| 10 | `TermsTooLong` | `terms` > 500 bytes | "Terms are too long." |
| 11 | `UpgradesLocked` | `upgrade` or `lock_upgrades` after the code was frozen | Admin-only; not shown to users |
| 12 | `NoPendingAdmin` | `accept_admin` with no admin proposed | Admin-only; not shown to users |

A failed token transfer (for example, the payer has less USDC than `amount`) aborts the
whole transaction. No escrow is created and nothing is left half-funded.

## Events

Escrow events have topics `("hodl", <action>, id)`, so one escrow's full history is a single
RPC `getEvents` filter: topics `["hodl", "*", <id as u64>]`, starting at `created_ledger`.
Data is a map keyed by field name.

| Topics | Data |
|---|---|
| `("hodl", "created", id)` | `{ payer, recipient, token, amount, deadline }` |
| `("hodl", "funded", id)` | `{ payer, amount }` |
| `("hodl", "released", id)` | `{ recipient, amount }` |
| `("hodl", "refunded", id)` | `{ payer, amount }` |
| `("hodl", "expired", id)` | `{ payer, amount }` where `amount` is what was returned (0 if never funded) |
| `("hodl", "token_added", token)` | `[]` |
| `("hodl", "token_removed", token)` | `[]` |
| `("hodl", "upgraded")` | `{ new_wasm_hash, from_version }` |
| `("hodl", "upgrades_locked")` | `[]` |
| `("hodl", "admin_proposed", new_admin)` | `[]` |
| `("hodl", "admin_changed", new_admin)` | `{ previous_admin }` |

`create_and_fund` emits `created` then `funded` in the same transaction. The Stellar Asset
Contract also emits its own `transfer` event for every movement of funds.

## Storage

| Key | Storage | Holds |
|---|---|---|
| `Admin` | instance | Allowlist admin |
| `AllowedToken(Address)` | instance | `true` per accepted token |
| `NextId` | instance | Next id to hand out, starting at 1 |
| `Escrow(u64)` | persistent | The `Escrow` struct |
| `ByPayer(Address)` | persistent | `Vec<u64>` of ids the address pays |
| `ByRecipient(Address)` | persistent | `Vec<u64>` of ids the address receives |
| `PendingAdmin` | instance | Proposed admin, until accepted |
| `UpgradesLocked` | instance | `true` once `lock_upgrades` ran; never cleared |

**TTL.** Every write extends the entries it touches to 120 days, and the instance to 30 days,
which keeps escrows from being archived mid-deal. Reads do not extend anything, so
simulations stay side-effect free. An archived persistent entry is not lost: it is restored
on its next write.

## Security model

- **One order everywhere:** load, then auth, then status check, then write state, then
  transfer, then event. State is final before any token moves.
- **Funds have two possible destinations:** the escrow's own payer or recipient. No function
  takes a destination address.
- **One signer per action.** `release`, `fund` and `claim_expired` need the payer; `refund`
  needs the recipient. `create_and_fund` needs exactly one payer signature, which covers the
  USDC transfer into the contract.
- **No admin function touches funds.** The admin cannot sign for an escrow, and no admin
  function moves, freezes or redirects money.
- **But the admin is trusted for code while upgrades are enabled.** New code can do
  anything, including move locked funds, so until `lock_upgrades` runs, users trust the
  admin key the same way they would trust a UUPS proxy owner. Every upgrade emits an
  `upgraded` event with the new wasm hash, so anyone can watch for it and inspect the code.
- **The allowlist** stops a fake "USDC" token being used to fake a funded escrow. Delisting
  a token never strands funds already locked in it.
- **Escrows are isolated.** Each one only ever moves its own `amount`, even though all funds
  share the contract's single balance.
- `overflow-checks = true` in the release profile. Length caps keep storage bounded.

## Upgrades

HodL follows Solidity's UUPS pattern. The upgrade logic lives in the contract itself and
there is no separate proxy. Soroban swaps a contract's code natively, so the address users
already know keeps working.

| UUPS (Solidity) | hodl-escrow (Soroban) |
|---|---|
| `upgradeTo(newImplementation)` | `upgrade(new_wasm_hash)` |
| `_authorizeUpgrade` → `onlyOwner` | `admin.require_auth()` |
| Proxy keeps storage and ETH | Contract keeps its storage and token balances |
| `upgradeToAndCall(impl, data)` for migrations | `upgrade`, then the new version's own admin-only `migrate` |
| Remove upgradeability in a final implementation | `lock_upgrades()`, which is permanent and checked by every later version |
| `Ownable2Step` | `propose_admin` then `accept_admin` |

**How to upgrade:** `scripts/upgrade.sh`. It checks that you are the admin and that upgrades
are still enabled. Then it builds the source, uploads the wasm, calls `upgrade`, prints
`version` before and after, and regenerates `web/contract`.

The new code takes effect from the next transaction. It can't run inside the same call
(Soroban has no re-entrancy), so a migration is always a second transaction.

**Rules for writing the next version:**

- Never reorder or remove `DataKey` variants or `Escrow` fields that existing entries use. New
  `Escrow` fields must be `Option`s: soroban-sdk 28+ reads a missing field as `None`.
- Keep `upgrade`, `lock_upgrades`, the admin functions and the `UpgradesLocked` check, or the
  new version strands itself.
- Bump `VERSION`, and add a `migrate` function only if the storage layout changes.
- Before mainnet, consider calling `lock_upgrades` once the code is audited, or moving the
  admin to a multisig.

**Tests:** the unit tests upgrade a live escrow contract to a stand-in v2
([`contracts/upgrade-fixture`](../contracts/upgrade-fixture), committed as
`contracts/hodl-escrow/testdata/upgrade_fixture.wasm`). They check that the address,
storage and locked funds survive, and that only the admin can upgrade. They also check
that `lock_upgrades` holds even after an admin handover, and that the handover only
completes when the new admin accepts. The same upgrade also ran on Testnet: a contract
holding 1 USDC was upgraded to v2 and still held the escrow and the funds.

### Known limits (v1, Testnet)

- Index lists grow by one id per escrow. Anyone can create an escrow naming any recipient,
  so a spammer could pad someone's "receiving" list. It costs the spammer fees and locks
  nothing of the victim's; the dashboard should page through ids with `get_escrows`.
- Public RPC keeps events for about a week. Older history falls back to the `created_at`,
  `funded_at` and `closed_at` fields stored on the escrow.
- No arbiter. "Conditions met" means the payer calls `release`. An optional arbiter is
  planned for v2.

## Build, test, deploy

```bash
cargo test                      # 35 unit tests
cargo clippy --all-targets -- -D warnings
stellar contract build --package hodl-escrow   # → target/wasm32v1-none/release/hodl_escrow.wasm
scripts/deploy.sh               # deploy to Testnet, write deployments/testnet.env, regenerate web/contract
scripts/upgrade.sh              # upgrade the deployed contract in place (admin only)
```

soroban-sdk 28+ needs `stellar contract build` (stellar-cli 25.2 or newer) for wasm, because
it strips unused spec entries. A plain `cargo build --target wasm32v1-none` fails by design.

### What the unit tests cover

The 15 cases from the Architecture.md testing plan, plus:

- **Deadline boundaries:** `fund` fails and `claim_expired` succeeds at exactly `deadline`.
- **Exact length caps:** 64 and 500 bytes pass, 65 and 501 fail, and multi-byte characters
  count by bytes.
- **Auth trees:** `release` requires exactly the payer's signature on `release(id)` and
  nothing else, and `create_and_fund` is one payer signature covering the inner transfer.
- **Wrong signers:** recipient, stranger and admin are each rejected at `require_auth` on
  `release`, `refund`, `fund` and `claim_expired`, and non-admins on `add_token` and
  `remove_token`.
- **Closed escrows:** every closed escrow rejects every action.
- **Atomicity:** an underfunded `create_and_fund` or `fund` leaves no trace.
- **Isolation:** several escrows share one balance without touching each other's funds.
- **Event shape:** exact topics and data for every event.
- **TTL:** writes extend the escrow, both index lists and the instance.

### Testnet end-to-end

`scripts/e2e.ts` runs scenarios A to F against the deployed contract and writes
[TRANSACTIONS.md](TRANSACTIONS.md):

```bash
cd scripts && npm install
node e2e.ts setup    # keypairs in scripts/.env, Friendbot XLM, USDC trustlines
# send ≥ 5 Testnet USDC to the printed payer address from https://faucet.circle.com
node e2e.ts
```

Rejected calls (scenarios E and F) are also submitted on-chain. Each row quotes the error the
network recorded, and the row passes only if it matches the simulated reason.
