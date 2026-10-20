HodL — Architecture & Build Plan
20 Oct 2026 · @Timmy
Overview
HodL is a non-custodial USDC escrow on Stellar Testnet, built as one Soroban contract plus one Next.js app on Vercel. There is no separate backend server and no database. The contract holds the funds and enforces every rule. The web app only builds transactions, asks the wallet to sign them, and reads state back from the chain.
The non-custodial guarantee. USDC sits in the contract's own balance on the USDC Stellar Asset Contract (SAC). Every function that moves money calls require_auth() on the right party. The app never holds a key, never signs on anyone's behalf, and no admin function can move the funds. The contract is upgradeable UUPS-style by the admin until lock_upgrades freezes it (see CONTRACT.md). If the website goes offline, anyone can still call the contract directly from the Stellar CLI or Stellar Lab.
Why no server works. Three design choices remove the need for a backend:
• The contract is the database. Each escrow stores its title and terms on-chain, and per-user index lists answer "show me my escrows".
• History comes from the chain. Contract events, read through Soroban RPC getEvents, give each action with its transaction hash and ledger time.
• "Expired" is computed on read. Nobody has to run a cron job to expire escrows; the contract and the UI derive it from the deadline.
The only server-side code is a few optional Next.js route handlers on Vercel (read-through cache, explorer proxy). They run as serverless functions inside the same app, never touch keys, and the app works without them.
Scope (all Testnet):
• Create an escrow with payer, recipient, token, amount, and deadline.
• Deposit and lock USDC in the contract.
• Release to the recipient, refund to the payer, or reclaim after expiry.
• Track status: Created, Funded, Released, Refunded, Expired.
• Block unauthorized withdrawals and duplicate releases or refunds.
• Show status, transaction history, and verifiable hashes in the UI.
System architecture
HodL has three parts: the browser app, Stellar's public Testnet services, and the escrow contract. Money only ever moves inside the contract, between the payer, the contract, and the recipient.
The app sends every call through Soroban RPC; the wallet signs it; the contract runs it and moves USDC through the USDC Stellar Asset Contract.
Where each piece of data lives
Data
Lives in
Read by the app through
Locked USDC
Contract's balance on the USDC SAC
get_escrow (amount, status)
Escrow terms, parties, deadline, status
Contract persistent storage
get_escrow, get_escrows
"My escrows" list
Contract index lists per address
get_user_escrows
History and tx hashes
Contract events
RPC getEvents
Wallet XLM, USDC, trustline
User's Stellar account
Horizon loadAccount
Private keys
User's wallet only
Never
A release, end to end
1. Payer clicks Release 50 USDC on /escrow/[id].
2. The app simulates release(id) through RPC. If the escrow is not Funded, the error shows here and nothing is signed.
3. The wallet opens, the payer approves, and the app submits the signed transaction.
4. The contract checks the payer's signature and the status, sets Released, and transfers 50 USDC from itself to the recipient.
5. The app polls until confirmed, shows the hash, and the released event appears in both parties' timelines.
Smart contract (Soroban)
One contract, hodl-escrow, holds every escrow and all locked USDC. Status only moves forward, and each function checks the current status before doing anything. That single check blocks duplicate releases and refunds.
Data model
#[contracttype]
pub enum Status { Created, Funded, Released, Refunded, Expired }

#[contracttype]
pub struct Escrow {
    pub id: u64,
    pub payer: Address,
    pub recipient: Address,
    pub token: Address,      // must be on the allowlist (Testnet USDC SAC)
    pub amount: i128,        // smallest unit of the token (USDC = 7 decimals)
    pub deadline: u64,       // ledger timestamp, seconds
    pub title: String,       // max 64 bytes
    pub terms: String,       // max 500 bytes, what was agreed
    pub status: Status,      // stored status
    pub created_at: u64,
    pub created_ledger: u32, // where the UI starts scanning events
    pub funded_at: u64,      // 0 until funded
    pub closed_at: u64,      // 0 until Released/Refunded/Expired
}
Title and terms live on-chain so no database is needed. On Testnet the storage cost is negligible.
Storage
Key
Storage type
Holds
Admin
Instance
Address that can edit the token allowlist and upgrade the code (no admin function touches funds)
AllowedToken(Address)
Instance
true for each accepted token (USDC SAC at deploy)
NextId
Instance
Counter for escrow ids
Escrow(u64)
Persistent
The Escrow struct
ByPayer(Address)
Persistent
Vec<u64> of escrow ids where the address pays
ByRecipient(Address)
Persistent
Vec<u64> of escrow ids where the address receives
Every write calls extend_ttl on the entries it touches, and the instance TTL is bumped on each call. Without this, an escrow could be archived mid-deal.
Functions
Function
Signer
Allowed when
Effect
__constructor(admin, usdc)
deployer
once, at deploy
Sets admin, allowlists USDC
create(payer, recipient, token, amount, deadline, title, terms) -> u64
payer
amount > 0, payer ≠ recipient, deadline > now, token allowed
New escrow, status Created, ids added to both index lists
fund(id)
payer
Created, now < deadline
USDC moves payer → contract, status Funded
create_and_fund(...) -> u64
payer
same as both
One transaction, one signature (the default in the UI)
release(id)
payer
Funded (any time)
USDC moves contract → recipient, status Released
refund(id)
recipient
Funded (any time)
Recipient sends the money back: contract → payer, status Refunded
claim_expired(id)
payer
Created or Funded, now ≥ deadline
If funded, contract → payer. Status Expired
get_escrow(id) -> EscrowView
anyone
always
Escrow plus effective_status
get_escrows(ids) -> Vec<EscrowView>
anyone
always
Batch read for the dashboard
get_user_escrows(addr) -> (Vec<u64>, Vec<u64>)
anyone
always
(paying, receiving) ids
add_token(token) / remove_token(token)
admin
always
Edits the allowlist only
upgrade(new_wasm_hash) / lock_upgrades()
admin
until locked
UUPS-style code swap; address, storage and funds stay. lock_upgrades is permanent
propose_admin(addr) / accept_admin()
admin / proposed admin
always
Two-step admin handover
V1 rule for "conditions met": the payer confirms by calling release. An optional arbiter: Option<Address> that can also release or refund is the planned v2, and is out of scope for the first ship.
Effective status. A Funded escrow past its deadline stays stored as Funded until someone calls claim_expired. get_escrow returns effective_status = Expired in that case, so the UI shows "Expired, funds claimable" without any cron job.
Errors
#[contracterror]
#[repr(u32)]
pub enum Error {
    NotFound = 1,
    InvalidStatus = 2,      // duplicate release/refund, funding twice, etc.
    InvalidAmount = 3,
    SameParty = 4,
    DeadlineInPast = 5,
    DeadlinePassed = 6,     // tried to fund after the deadline
    DeadlineNotReached = 7, // tried to claim before the deadline
    TokenNotAllowed = 8,
    TitleTooLong = 9,
    TermsTooLong = 10,
}
Unauthorized callers never reach these: require_auth() fails first and the transaction aborts. The frontend maps each code to a plain message.
Events
Every state change emits one event with topics ("hodl", <action>, id). The data carries what the timeline needs.
Action topic
Data
created
payer, recipient, token, amount, deadline
funded
payer, amount
released
recipient, amount
refunded
payer, amount
expired
payer, amount returned (0 if never funded)
Pattern every money-moving function follows
pub fn release(env: Env, id: u64) -> Result<(), Error> {
    let mut e = storage::load(&env, id)?;          // NotFound
    e.payer.require_auth();                        // only the payer
    if e.status != Status::Funded {                // blocks double release
        return Err(Error::InvalidStatus);
    }
    e.status = Status::Released;                   // state first
    e.closed_at = env.ledger().timestamp();
    storage::save(&env, &e);
    token::Client::new(&env, &e.token)             // then move funds
        .transfer(&env.current_contract_address(), &e.recipient, &e.amount);
    events::released(&env, id, &e.recipient, e.amount);
    Ok(())
}
Security rules
• Load, then auth, then status check, then write state, then transfer. Same order in every function.
• Funds can only ever go to the escrow's own payer or recipient. No function takes a destination address.
• No admin function moves or freezes funds. The admin can upgrade the code until lock_upgrades, so it is trusted for upgrades; every upgrade emits an event.
• The allowlist stops fake "USDC" tokens being used to fake a funded escrow.
• overflow-checks = true in the release profile.
• Length caps on title and terms keep storage bounded.
Frontend architecture
The whole product is one Next.js App Router app that talks straight to Soroban RPC and Horizon from the browser. Wallets sign; the app never sees a secret key.
Stack
Concern
Choice
Framework
Next.js (App Router) + TypeScript
Styling
Tailwind CSS, CSS variables for design tokens
Wallets
@creit.tech/stellar-wallets-kit (Freighter, xBull, Lobstr, Albedo, Hana)
Chain SDK
@stellar/stellar-sdk (rpc.Server for Soroban, Horizon.Server for balances and trustlines)
Contract client
TypeScript bindings generated by stellar contract bindings typescript
Data fetching
TanStack Query (cache, polling, refetch after each tx)
Forms
React Hook Form + Zod
Folder structure
hodl/
├─ contracts/hodl-escrow/
│  ├─ Cargo.toml
│  └─ src/  lib.rs  types.rs  storage.rs  events.rs  errors.rs  test.rs
├─ web/                          # the Next.js app (Vercel root directory)
│  ├─ app/
│  │  ├─ page.tsx                # landing
│  │  ├─ setup/page.tsx
│  │  ├─ dashboard/page.tsx
│  │  ├─ escrow/new/page.tsx
│  │  ├─ escrow/[id]/page.tsx
│  │  ├─ activity/page.tsx
│  │  └─ how-it-works/page.tsx
│  ├─ components/                # ui/, escrow/, wallet/, layout/
│  ├─ hooks/                     # useWallet, useEscrow, useUserEscrows,
│  │                             # useEscrowEvents, useContractTx, useReadiness
│  ├─ lib/stellar/               # config, rpc, horizon, events, usdc, errors
│  └─ contract/                  # generated bindings, committed
├─ scripts/  deploy.sh  bindings.sh  e2e.ts
└─ docs/  ARCHITECTURE.md  CONTRACT.md  TRANSACTIONS.md
The generated bindings live inside web/contract/ and are committed. That keeps the Vercel build to a plain next build with no workspace or Rust toolchain.
Transaction lifecycle (useContractTx)
Every write goes through one hook so the UX is identical for create, fund, release, refund, and claim.
1. Simulating. The generated client builds the call and simulates it against RPC. A contract error here (for example InvalidStatus) is shown before the wallet ever opens.
2. Awaiting signature. The wallet kit's signTransaction opens the user's wallet.
3. Submitting. The signed transaction is sent to RPC.
4. Confirming. The hook polls getTransaction until the result is SUCCESS or FAILED.
5. Done. The UI shows the hash with a link to stellar.expert/explorer/testnet/tx/<hash>, then invalidates the escrow, dashboard, and history queries.
Failures are mapped to plain messages: wallet rejected, insufficient USDC, missing trustline, or a contract error code from the table in the contract section.
Reading data
What
Source
Refresh
One escrow
get_escrow(id) via simulation (no signature, no fee)
every 10 s on the detail page
My escrows
get_user_escrows(addr), then get_escrows(ids)
on load, after each tx
Escrow history
RPC getEvents, filtered by contract id and topic ("hodl", *, id), starting at created_ledger
every 10 s on the detail page
Wallet readiness
Horizon loadAccount: XLM balance, USDC trustline, USDC balance
on connect, after a trustline tx
Public RPC keeps events for a limited window (about a week). Inside that window the timeline shows every hash. For older escrows the timeline falls back to the created_at, funded_at and closed_at timestamps stored in the contract, plus a link to the contract on Stellar Expert. That is enough for this project, which runs entirely on Testnet.
Server-side code
None is required. Two optional Next.js additions, both stateless and keyless:
• app/escrow/[id]/opengraph-image.tsx: a share card (title, amount, status) when the escrow link is pasted into WhatsApp or X.
• app/api/escrow/[id]/route.ts: a cached read of get_escrow for link previews and bots.
If permanent history beyond the RPC window ever matters, the upgrade is a Vercel Cron job plus a small KV store. It stays out of v1.
Pages and user flows
Seven routes cover the whole product, and the escrow detail page does most of the work. Every page shares one header: logo, nav (Dashboard, New escrow, Activity), a "Testnet" pill, and the wallet button.
Route
Purpose
Key components
/
Landing: what HodL is, the three steps (Create, Lock, Release or Refund), the non-custodial promise, live contract address
Hero, StepStrip, ContractAddressCard, CTA
/setup
Wallet readiness checklist before first use
ReadinessChecklist (wallet on Testnet, XLM funded, USDC trustline, USDC balance), each row with a fix button
/dashboard
All my escrows
Tabs (Paying / Receiving), status filter chips, EscrowCard grid, empty state
/escrow/new
Create an escrow
Form (recipient, amount, deadline, title, terms), ReviewSheet, TxStatus
/escrow/[id]
One escrow: status, parties, money, actions, history. Shareable link
DepositSlip, StatusBadge, PartyRow, Countdown, ActionPanel, Timeline
/activity
Every transaction the connected wallet made through HodL
TxTable (date, escrow, action, amount, hash)
/how-it-works
For reviewers: state machine, function list, contract address, Stellar Expert links, repo link
StateDiagram, FunctionTable, VerifyLinks
/setup readiness checklist
This page exists because a missing trustline is the most likely way the demo breaks. Each row checks itself and offers one fix.
Check
How it's detected
Fix button
Wallet on Testnet
Wallet kit's network passphrase
"Switch your wallet to Testnet" help text
XLM for fees
Horizon loadAccount (404 = unfunded)
"Fund with Friendbot"
USDC trustline
USDC entry in account balances
"Add USDC trustline" (changeTrust, signed in wallet)
USDC balance
Same balance entry
Link to Circle's Testnet faucet
The same check runs as a small banner on /escrow/new (payer) and on /escrow/[id] (recipient before release, payer before refund or claim). The contract account itself needs no trustline.
/escrow/new
1. Form. Recipient address (validated as a G… key, not your own), amount in USDC (shows your balance), deadline (presets 1 h, 24 h, 7 d, or a custom date), title, terms.
2. Review. A deposit-slip preview of exactly what gets locked, with a plain-English summary: "You lock 50 USDC. Only you can release it to GABC…XYZ. If not released by 24 Oct 18:00, you can reclaim it."
3. Sign. The primary button is "Create & lock 50 USDC" (create_and_fund). A secondary "Create only, fund later" calls create.
4. Done. Redirects to /escrow/[id] with the tx hash in a toast and a "Copy link for recipient" button.
/escrow/[id] action panel
The panel shows only what the connected wallet is allowed to do. The contract enforces the same rules anyway.
Effective status
Payer sees
Recipient sees
Anyone else sees
Created, before deadline
Fund (lock USDC)
"Waiting for the payer to fund"
Read-only
Created, past deadline
Close (claim_expired, nothing to return)
"Expired before funding"
Read-only
Funded, before deadline
Release to recipient
Refund to payer
Read-only
Funded, past deadline
Reclaim funds or Release anyway
"Deadline passed, payer can reclaim"
Read-only
Released / Refunded / Expired
Final state + closing tx hash
Final state + closing tx hash
Final state + closing tx hash
Release and refund open a confirm dialog that restates amount, destination, and that the action is final.
Flows
Payer happy path: connect wallet → setup checklist passes → New escrow → Create & lock → share link → later, Release → recipient is paid.
Recipient path: opens the shared link → connects wallet → sees "You'll receive 50 USDC" → adds trustline if missing → waits for release, or chooses Refund to payer.
Expiry path: deadline passes with escrow Funded → payer sees Reclaim → claim_expired → status Expired, funds back.
Wrong wallet: anyone else opening the link sees the escrow read-only with "You're not a party to this escrow."
Design system
The direction is "Vault ledger": calm, exact, and trustworthy, like a bank deposit slip rather than a crypto dashboard. Money and status carry the visual weight. Everything else stays quiet.
Principles
• Status is the main visual language. One colour and one icon per status, used the same way on badges, cards, and timeline dots.
• Numbers are sacred. Every amount, address, and hash is in a monospace font with tabular figures, so figures line up and nothing looks hand-typed.
• Say what the money does. Buttons name the action and the amount: "Lock 50 USDC", "Release 50 USDC to GABC…XYZ". Never "Submit".
• No crypto chrome. No gradients, glows, or neon. Flat surfaces, thin rules, generous space.
Colour tokens
Token
Light
Dark
Use
--bg
#F6F3EC warm paper
#0B0F17
Page background
--surface
#FFFFFF
#121826
Cards, slips, dialogs
--ink
#0E1420
#E8E4DA
Primary text, primary buttons
--ink-2
#4A5363
#9AA3B2
Secondary text, labels
--line
#E3DED3
#222A3A
Borders, dividers, timeline rail
--brass
#B8862B
#D4A64A
The one accent: locked funds, "Lock" button, focus ring
Status colours
Status
Colour
Icon (Lucide)
Meaning shown to users
Created
#8A93A3 grey
lock-open outline
Agreement made, nothing locked yet
Funded
#B8862B brass
lock filled
USDC is locked in the contract
Released
#2F8F5B green
arrow-up-right
Paid to the recipient
Refunded
#3E6FB0 blue
undo-2
Returned to the payer by the recipient
Expired
#B5523B muted red
clock-alert
Deadline passed; funds back to payer or claimable
Badges use the status colour at 12% opacity as fill, the full colour for the border and icon, and --ink for text so contrast holds in both themes.
Type
• UI: Geist, weights 400 / 500 / 600.
• Figures: Geist Mono with font-variant-numeric: tabular-nums for amounts, addresses, hashes, countdowns.
• Scale (px): 12 caption · 14 body small · 16 body · 20 section title · 28 page title · 48 deposit-slip amount.
Signature components
• DepositSlip. The hero of /escrow/[id] and the create review step. A white card with a dashed tear line across the top, the amount in 48 px mono, "USDC" beside it, payer → recipient underneath, and the deadline. A padlock in the corner snaps shut (250 ms) when funding confirms and swings open on release.
• Timeline. A vertical rail like a bank statement. Each row: status dot, action ("Funded"), actor chip, time, and a TxHash chip. The newest row is at the top.
• AddressChip. Truncated GABC…XYZ1 in mono, a copy button, and a "You" tag when it matches the connected wallet. Full address in a tooltip.
• TxHash. Truncated hash in mono, copy button, external-link icon to Stellar Expert.
• Countdown. "2d 4h left" in mono. It turns --brass under 24 h and Expired red at zero.
• TxStatus toast. Four steps (Simulating, Sign in wallet, Submitting, Confirmed) with the hash appearing on the last one.
Buttons
Variant
Look
Used for
Primary
--ink fill, --bg text
Create, Connect wallet
Lock
--brass fill, ink text
Fund / Create & lock
Release
Released-green fill
Release to recipient
Secondary
Outline --line, ink text
Refund, Reclaim, Close, Cancel
Layout and motion
• Max content width 1120 px. The detail page is two columns on desktop (slip + actions left, timeline right) and one column on mobile, with the action panel sticky at the bottom.
• Corner radius 12 px for cards, 8 px for buttons and chips.
• Motion is functional only: the padlock, a 150 ms fade for new timeline rows, and skeleton loaders. Respect prefers-reduced-motion.
Testing plan
Testing runs in three layers: Rust unit tests prove the rules, a Testnet script proves the deployed contract and produces the verifiable hashes, and a manual pass proves the UI.
1. Contract unit tests (cargo test)
Setup per test: register a Stellar Asset Contract as fake USDC, mint to the payer, register hodl-escrow with the constructor args, and move time with env.ledger().with_mut(|l| l.timestamp = …). Use the try_ client methods to assert specific errors.
#
Test
Expect
1
create → fund → release
Recipient +amount, contract 0, status Released, released event
2
create_and_fund → refund by recipient
Payer back to start, status Refunded
3
fund, jump past deadline, claim_expired
Payer refunded, status Expired
4
Created, past deadline, claim_expired
No transfer, status Expired
5
Fund after deadline
DeadlinePassed
6
claim_expired before deadline
DeadlineNotReached
7
release called twice
Second call InvalidStatus
8
refund after release, release after refund
InvalidStatus
9
fund twice
InvalidStatus
10
release signed by recipient or a stranger
Auth failure (use mock_auths for one specific address, not mock_all_auths)
11
refund signed by payer or a stranger
Auth failure
12
Non-allowlisted token, amount 0, payer = recipient, deadline in past, long title
Matching error codes
13
get_escrow on Funded past deadline
effective_status = Expired
14
Index lists
Both parties' lists contain the id
15
Admin tries to move funds
No such function; remove_token does not affect existing escrows
2. Testnet end-to-end script (scripts/e2e.ts)
Runs against the deployed contract with three Testnet keypairs (payer, recipient, stranger) read from a local .env that is never committed. It writes every step to docs/TRANSACTIONS.md as scenario, step, result, and a Stellar Expert link.
Scenario
Steps
A. Happy release
create_and_fund → release
B. Recipient refund
create_and_fund → refund
C. Expiry
create_and_fund with a 2-minute deadline → wait → claim_expired
D. Two-step create
create → fund → release
E. Unauthorized
stranger calls release; recipient calls release; payer calls refund
F. Duplicates
release on A again; refund on B again; fund on D again
Scenarios A to D produce successful hashes. E and F record the rejection with its error code. Where the script can submit the rejected call on-chain, it also records the failed transaction hash. This single file is the "verifiable transaction hashes" deliverable.
3. Manual QA on the deployed site
[ ] Connect with Freighter and with one other wallet
[ ] Wallet on Mainnet shows the "switch to Testnet" warning
[ ] Setup checklist: Friendbot, add trustline, faucet link all work
[ ] Create & lock, then open the link in a second browser as recipient
[ ] Release shows in both browsers within 10 s, hash links resolve on Stellar Expert
[ ] Refund path and expiry path work end to end
[ ] Third wallet sees read-only view with no action buttons
[ ] Recipient without trustline is blocked with a clear fix
[ ] Rejecting in the wallet shows a friendly message, nothing breaks
[ ] Mobile layout: sticky action panel, readable slip, no horizontal scroll
Deployment
The contract is deployed once to Testnet from a laptop with the Stellar CLI. The Next.js app deploys to Vercel from GitHub on every push to main. The only link between them is the contract id in an environment variable.
Contract to Testnet
# 1. Deployer identity, funded by Friendbot
stellar keys generate deployer --network testnet --fund

# 2. USDC Stellar Asset Contract id (Circle Testnet USDC)
stellar contract id asset \
  --asset USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
  --network testnet

# 3. Build and deploy with constructor args
stellar contract build
stellar contract deploy \
  --wasm target/wasm32v1-none/release/hodl_escrow.wasm \
  --source deployer --network testnet \
  -- --admin $(stellar keys address deployer) --usdc <USDC_SAC_ID>

# 4. Regenerate the TypeScript client into the web app
stellar contract bindings typescript \
  --network testnet --contract-id <HODL_CONTRACT_ID> \
  --output-dir web/contract --overwrite
scripts/deploy.sh wraps all four steps and prints the contract id. Use the .wasm path that stellar contract build prints if your toolchain uses a different target folder. The issuer above is Circle's Testnet USDC issuer (Circle docs); Testnet USDC comes from faucet.circle.com.
Web app to Vercel
1. Push the repo to GitHub.
2. In Vercel, import the repo and set Root Directory to web. Framework preset Next.js, default build command.
3. Add the environment variables below for Production and Preview.
4. Deploy. Every push to main ships to production; every pull request gets a preview URL.
5. Optional: attach a custom domain, otherwise hodl-<team>.vercel.app is the demo URL.
Variable
Value
NEXT_PUBLIC_STELLAR_NETWORK
testnet
NEXT_PUBLIC_NETWORK_PASSPHRASE
Test SDF Network ; September 2015
NEXT_PUBLIC_RPC_URL
https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL
https://horizon-testnet.stellar.org
NEXT_PUBLIC_HODL_CONTRACT_ID
The id printed by deploy.sh
NEXT_PUBLIC_USDC_SAC_ID
The id from step 2
NEXT_PUBLIC_USDC_ISSUER
GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
NEXT_PUBLIC_EXPLORER_URL
https://stellar.expert/explorer/testnet
All values are public, so no secrets live on Vercel. The app builds the contract client with NEXT_PUBLIC_HODL_CONTRACT_ID at runtime rather than trusting the id baked into the bindings, so a redeploy only needs an env change.
CI (GitHub Actions)
• On every pull request: cargo test in contracts/, then pnpm lint && pnpm build in web/.
• Vercel handles the web deploy itself; CI never touches keys or Testnet.
Testnet reset playbook
Stellar Testnet is reset periodically, which wipes the contract and all accounts. Recovery takes about 10 minutes:
1. Run scripts/deploy.sh to get a new contract id.
2. Update NEXT_PUBLIC_HODL_CONTRACT_ID (and the USDC SAC id if it changed) in Vercel, then redeploy.
3. Re-fund the e2e keypairs and rerun scripts/e2e.ts to regenerate docs/TRANSACTIONS.md.
4. Update the contract address in the README.
Build order and deliverables
Build the contract and its proof first. Once the e2e script passes on Testnet, the hard requirements are met and the frontend is wiring.
1. Contract. Types, storage, functions, errors, events, all 15 unit tests green.
2. Deploy + e2e. deploy.sh, then e2e.ts producing docs/TRANSACTIONS.md.
3. App shell. Next.js, Tailwind tokens, header, wallet connect, Testnet guard, bindings wired to env.
4. Setup checklist. Friendbot, trustline, balances.
5. Create flow. Form, review slip, create_and_fund, useContractTx.
6. Escrow detail. DepositSlip, action panel, timeline from getEvents.
7. Dashboard and activity.
8. Landing and how-it-works. State diagram, contract address, verify links.
9. Ship. Vercel deploy, manual QA pass, README, demo video.
Deliverables checklist
[ ] GitHub repository (contract, web app, scripts, docs)
[ ] Deployed Testnet contract address, linked on Stellar Expert
[ ] Working demo URL on Vercel
[ ] Demo video (3 to 5 min): create & lock, recipient view, release, refund, expiry claim, a rejected unauthorized call, hashes opened on Stellar Expert
[ ] Technical docs: ARCHITECTURE.md, CONTRACT.md (functions, errors, state machine)
[ ] Verifiable transaction hashes: TRANSACTIONS.md from the e2e script
[ ] README: what HodL is, how to run locally, env vars, contract address, links to all of the above
Sources
• Circle: Transfer USDC on Stellar (Testnet issuer, faucet)