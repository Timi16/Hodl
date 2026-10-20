extern crate std;

use crate::events;
use crate::storage::{INSTANCE_EXTEND_TO, PERSISTENT_EXTEND_TO};
use crate::*;
use soroban_sdk::{
    symbol_short,
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, AuthorizedFunction, AuthorizedInvocation, Events as _, Ledger, MockAuth,
        MockAuthInvoke,
    },
    token::{StellarAssetClient, TokenClient},
    vec,
    xdr::{ScErrorCode, ScErrorType},
    Address, Env, Event, IntoVal, InvokeError, String, Symbol, Val,
};

const START: u64 = 1_750_000_000;
const DAY: u64 = 86_400;
const DEADLINE: u64 = START + DAY;
/// 50 USDC (7 decimals).
const AMOUNT: i128 = 500_000_000;
const PAYER_START: i128 = 10 * AMOUNT;

/// What a failed `require_auth` looks like from a function that does not
/// return `Result` (the admin functions).
fn not_authorized() -> soroban_sdk::Error {
    soroban_sdk::Error::from_type_and_code(ScErrorType::Context, ScErrorCode::InvalidAction)
}

struct Setup {
    env: Env,
    client: HodlEscrowClient<'static>,
    contract: Address,
    admin: Address,
    payer: Address,
    recipient: Address,
    stranger: Address,
    usdc: TokenClient<'static>,
}

impl Setup {
    /// Fake USDC as a real Stellar Asset Contract, minted to the payer, and
    /// hodl-escrow registered with its constructor args.
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|l| {
            l.timestamp = START;
            l.sequence_number = 1_000;
        });

        let admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let recipient = Address::generate(&env);
        let stranger = Address::generate(&env);

        let usdc = Self::new_token(&env);
        StellarAssetClient::new(&env, &usdc.address).mint(&payer, &PAYER_START);

        let contract = env.register(HodlEscrow, (&admin, &usdc.address));
        let client = HodlEscrowClient::new(&env, &contract);

        Setup {
            env,
            client,
            contract,
            admin,
            payer,
            recipient,
            stranger,
            usdc,
        }
    }

    fn new_token(env: &Env) -> TokenClient<'static> {
        let sac = env.register_stellar_asset_contract_v2(Address::generate(env));
        TokenClient::new(env, &sac.address())
    }

    fn str(&self, s: &str) -> String {
        String::from_str(&self.env, s)
    }

    fn create(&self) -> u64 {
        self.client.create(
            &self.payer,
            &self.recipient,
            &self.usdc.address,
            &AMOUNT,
            &DEADLINE,
            &self.str("Logo design"),
            &self.str("Three concepts, two revisions."),
        )
    }

    fn create_and_fund(&self) -> u64 {
        self.client.create_and_fund(
            &self.payer,
            &self.recipient,
            &self.usdc.address,
            &AMOUNT,
            &DEADLINE,
            &self.str("Logo design"),
            &self.str("Three concepts, two revisions."),
        )
    }

    fn escrow(&self, id: u64) -> Escrow {
        self.client.get_escrow(&id).escrow
    }

    fn set_time(&self, timestamp: u64) {
        self.env.ledger().with_mut(|l| l.timestamp = timestamp);
    }

    fn balance(&self, who: &Address) -> i128 {
        self.usdc.balance(who)
    }

    /// Runs `call` with only `who` signing, and only for the top-level call
    /// `fn_name(args)`. Restores `mock_all_auths` afterwards.
    fn as_signer<R>(
        &self,
        who: &Address,
        fn_name: &str,
        args: soroban_sdk::Vec<Val>,
        call: impl FnOnce() -> R,
    ) -> R {
        self.env.mock_auths(&[MockAuth {
            address: who,
            invoke: &MockAuthInvoke {
                contract: &self.contract,
                fn_name,
                args,
                sub_invokes: &[],
            },
        }]);
        let result = call();
        self.env.mock_all_auths();
        result
    }

    /// Calls `fn_name(id)` signed only by `who` and asserts the host rejects it
    /// at `require_auth`, before any contract error can be returned.
    fn assert_rejects_signer(&self, who: &Address, fn_name: &str, id: u64) {
        let result = self.as_signer(who, fn_name, (id,).into_val(&self.env), || match fn_name {
            "fund" => self.client.try_fund(&id),
            "release" => self.client.try_release(&id),
            "refund" => self.client.try_refund(&id),
            "claim_expired" => self.client.try_claim_expired(&id),
            _ => unreachable!(),
        });
        // Abort, not a contract error code: execution stopped at require_auth.
        assert_eq!(
            result,
            Err(Err(InvokeError::Abort)),
            "{fn_name} signed by the wrong party must fail auth"
        );
    }

    fn hodl_events(&self) -> soroban_sdk::testutils::ContractEvents {
        self.env.events().all().filter_by_contract(&self.contract)
    }
}

// ===================================================================
// 1-4. Happy paths
// ===================================================================

/// Test 1: create → fund → release
#[test]
fn create_fund_release_pays_recipient() {
    let s = Setup::new();
    let id = s.create();
    assert_eq!(id, 1);
    assert_eq!(s.escrow(id).status, Status::Created);
    assert_eq!(s.balance(&s.contract), 0);

    s.set_time(START + 60);
    s.client.fund(&id);
    let e = s.escrow(id);
    assert_eq!(e.status, Status::Funded);
    assert_eq!(e.funded_at, START + 60);
    assert_eq!(s.balance(&s.payer), PAYER_START - AMOUNT);
    assert_eq!(s.balance(&s.contract), AMOUNT);

    s.set_time(START + 120);
    s.client.release(&id);
    assert_eq!(
        s.hodl_events(),
        [events::Released {
            id,
            recipient: s.recipient.clone(),
            amount: AMOUNT,
        }
        .to_xdr(&s.env, &s.contract)]
    );

    let e = s.escrow(id);
    assert_eq!(e.status, Status::Released);
    assert_eq!(e.closed_at, START + 120);
    assert_eq!(s.balance(&s.recipient), AMOUNT);
    assert_eq!(s.balance(&s.contract), 0);
    assert_eq!(s.balance(&s.payer), PAYER_START - AMOUNT);
    assert_eq!(s.client.get_escrow(&id).effective_status, Status::Released);
}

/// Test 2: create_and_fund → refund by recipient
#[test]
fn create_and_fund_then_recipient_refunds() {
    let s = Setup::new();
    let id = s.create_and_fund();
    assert_eq!(s.escrow(id).status, Status::Funded);
    assert_eq!(s.balance(&s.contract), AMOUNT);

    s.client.refund(&id);
    assert_eq!(
        s.hodl_events(),
        [events::Refunded {
            id,
            payer: s.payer.clone(),
            amount: AMOUNT,
        }
        .to_xdr(&s.env, &s.contract)]
    );

    let e = s.escrow(id);
    assert_eq!(e.status, Status::Refunded);
    assert_eq!(s.balance(&s.payer), PAYER_START);
    assert_eq!(s.balance(&s.recipient), 0);
    assert_eq!(s.balance(&s.contract), 0);
}

/// Test 3: fund, jump past deadline, claim_expired
#[test]
fn funded_escrow_reclaimed_after_deadline() {
    let s = Setup::new();
    let id = s.create_and_fund();
    s.set_time(DEADLINE + 1);
    s.client.claim_expired(&id);
    assert_eq!(
        s.hodl_events(),
        [events::Expired {
            id,
            payer: s.payer.clone(),
            amount: AMOUNT,
        }
        .to_xdr(&s.env, &s.contract)]
    );

    let e = s.escrow(id);
    assert_eq!(e.status, Status::Expired);
    assert_eq!(e.closed_at, DEADLINE + 1);
    assert_eq!(s.balance(&s.payer), PAYER_START);
    assert_eq!(s.balance(&s.contract), 0);
}

/// Test 4: Created, past deadline, claim_expired: nothing to return.
#[test]
fn unfunded_escrow_closed_after_deadline_without_transfer() {
    let s = Setup::new();
    let id = s.create();
    s.set_time(DEADLINE);
    s.client.claim_expired(&id);

    // Only our event: no token transfer happened.
    assert_eq!(
        s.env.events().all(),
        [events::Expired {
            id,
            payer: s.payer.clone(),
            amount: 0,
        }
        .to_xdr(&s.env, &s.contract)]
    );
    assert_eq!(s.escrow(id).status, Status::Expired);
    assert_eq!(s.balance(&s.payer), PAYER_START);
}

// ===================================================================
// 5-9. Deadline and status rules
// ===================================================================

/// Test 5: Fund after deadline
#[test]
fn fund_at_or_after_deadline_fails() {
    let s = Setup::new();
    let id = s.create();
    s.set_time(DEADLINE);
    assert_eq!(s.client.try_fund(&id), Err(Ok(Error::DeadlinePassed)));
    s.set_time(DEADLINE + DAY);
    assert_eq!(s.client.try_fund(&id), Err(Ok(Error::DeadlinePassed)));
    assert_eq!(s.balance(&s.contract), 0);
}

/// Test 6: claim_expired before deadline
#[test]
fn claim_before_deadline_fails() {
    let s = Setup::new();
    let funded = s.create_and_fund();
    let unfunded = s.create();
    s.set_time(DEADLINE - 1);
    assert_eq!(
        s.client.try_claim_expired(&funded),
        Err(Ok(Error::DeadlineNotReached))
    );
    assert_eq!(
        s.client.try_claim_expired(&unfunded),
        Err(Ok(Error::DeadlineNotReached))
    );
    assert_eq!(s.balance(&s.contract), AMOUNT);
}

/// The deadline second itself belongs to "expired": fund fails and claim
/// succeeds, so there is no moment where both or neither are allowed.
#[test]
fn deadline_boundary_is_consistent() {
    let s = Setup::new();
    let id = s.create_and_fund();
    let unfunded = s.create();

    s.set_time(DEADLINE - 1);
    assert_eq!(s.client.get_escrow(&id).effective_status, Status::Funded);
    assert_eq!(
        s.client.try_claim_expired(&id),
        Err(Ok(Error::DeadlineNotReached))
    );

    s.set_time(DEADLINE);
    assert_eq!(s.client.get_escrow(&id).effective_status, Status::Expired);
    assert_eq!(s.client.try_fund(&unfunded), Err(Ok(Error::DeadlinePassed)));
    s.client.claim_expired(&id);
    assert_eq!(s.escrow(id).status, Status::Expired);
}

/// Test 7: release called twice
#[test]
fn double_release_fails() {
    let s = Setup::new();
    let id = s.create_and_fund();
    s.client.release(&id);
    assert_eq!(s.client.try_release(&id), Err(Ok(Error::InvalidStatus)));
    assert_eq!(s.balance(&s.recipient), AMOUNT);
}

/// Test 8: refund after release, release after refund
#[test]
fn refund_after_release_and_release_after_refund_fail() {
    let s = Setup::new();
    let released = s.create_and_fund();
    s.client.release(&released);
    assert_eq!(
        s.client.try_refund(&released),
        Err(Ok(Error::InvalidStatus))
    );

    let refunded = s.create_and_fund();
    s.client.refund(&refunded);
    assert_eq!(
        s.client.try_release(&refunded),
        Err(Ok(Error::InvalidStatus))
    );
    assert_eq!(
        s.client.try_refund(&refunded),
        Err(Ok(Error::InvalidStatus))
    );

    assert_eq!(s.balance(&s.recipient), AMOUNT);
    assert_eq!(s.balance(&s.payer), PAYER_START - AMOUNT);
    assert_eq!(s.balance(&s.contract), 0);
}

/// Test 9: fund twice
#[test]
fn double_fund_fails() {
    let s = Setup::new();
    let id = s.create();
    s.client.fund(&id);
    assert_eq!(s.client.try_fund(&id), Err(Ok(Error::InvalidStatus)));
    assert_eq!(s.balance(&s.contract), AMOUNT);

    let id = s.create_and_fund();
    assert_eq!(s.client.try_fund(&id), Err(Ok(Error::InvalidStatus)));
    assert_eq!(s.balance(&s.contract), 2 * AMOUNT);
}

/// Release, refund and fund are all rejected once an escrow is closed, and
/// claim_expired cannot run twice.
#[test]
fn closed_escrows_reject_every_action() {
    let s = Setup::new();
    let released = s.create_and_fund();
    s.client.release(&released);
    let refunded = s.create_and_fund();
    s.client.refund(&refunded);
    let expired = s.create_and_fund();
    s.set_time(DEADLINE);
    s.client.claim_expired(&expired);

    for id in [released, refunded, expired] {
        assert_eq!(s.client.try_fund(&id), Err(Ok(Error::InvalidStatus)));
        assert_eq!(s.client.try_release(&id), Err(Ok(Error::InvalidStatus)));
        assert_eq!(s.client.try_refund(&id), Err(Ok(Error::InvalidStatus)));
        assert_eq!(
            s.client.try_claim_expired(&id),
            Err(Ok(Error::InvalidStatus))
        );
    }
    assert_eq!(s.balance(&s.contract), 0);
}

/// Past the deadline a funded escrow can still be released ("Release anyway")
/// or refunded by the recipient.
#[test]
fn release_and_refund_still_work_after_deadline() {
    let s = Setup::new();
    let a = s.create_and_fund();
    let b = s.create_and_fund();
    s.set_time(DEADLINE + DAY);

    s.client.release(&a);
    assert_eq!(s.escrow(a).status, Status::Released);
    s.client.refund(&b);
    assert_eq!(s.escrow(b).status, Status::Refunded);
    assert_eq!(s.balance(&s.recipient), AMOUNT);
    assert_eq!(s.balance(&s.payer), PAYER_START - AMOUNT);
}

#[test]
fn unknown_id_is_not_found() {
    let s = Setup::new();
    assert_eq!(s.client.try_get_escrow(&0), Err(Ok(Error::NotFound)));
    assert_eq!(s.client.try_get_escrow(&42), Err(Ok(Error::NotFound)));
    assert_eq!(s.client.try_fund(&42), Err(Ok(Error::NotFound)));
    assert_eq!(s.client.try_release(&42), Err(Ok(Error::NotFound)));
    assert_eq!(s.client.try_refund(&42), Err(Ok(Error::NotFound)));
    assert_eq!(s.client.try_claim_expired(&42), Err(Ok(Error::NotFound)));
}

// ===================================================================
// 10-11. Authorization
// ===================================================================

/// Test 10: release signed by recipient or a stranger
#[test]
fn only_payer_can_release() {
    let s = Setup::new();
    let id = s.create_and_fund();
    s.assert_rejects_signer(&s.recipient, "release", id);
    s.assert_rejects_signer(&s.stranger, "release", id);
    s.assert_rejects_signer(&s.admin, "release", id);
    assert_eq!(s.escrow(id).status, Status::Funded);
    assert_eq!(s.balance(&s.contract), AMOUNT);

    // The payer's signature on exactly release(id) is enough, and is the
    // only authorization the call needs.
    s.as_signer(&s.payer, "release", (id,).into_val(&s.env), || {
        s.client.release(&id);
        assert_eq!(
            s.env.auths(),
            std::vec![(
                s.payer.clone(),
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        s.contract.clone(),
                        Symbol::new(&s.env, "release"),
                        (id,).into_val(&s.env),
                    )),
                    sub_invocations: std::vec![],
                }
            )]
        );
    });
    assert_eq!(s.balance(&s.recipient), AMOUNT);
}

/// Test 11: refund signed by payer or a stranger
#[test]
fn only_recipient_can_refund() {
    let s = Setup::new();
    let id = s.create_and_fund();
    s.assert_rejects_signer(&s.payer, "refund", id);
    s.assert_rejects_signer(&s.stranger, "refund", id);
    s.assert_rejects_signer(&s.admin, "refund", id);
    assert_eq!(s.escrow(id).status, Status::Funded);

    s.as_signer(&s.recipient, "refund", (id,).into_val(&s.env), || {
        s.client.refund(&id)
    });
    assert_eq!(s.escrow(id).status, Status::Refunded);
}

#[test]
fn only_payer_can_fund_or_claim() {
    let s = Setup::new();
    let id = s.create();
    s.assert_rejects_signer(&s.recipient, "fund", id);
    s.assert_rejects_signer(&s.stranger, "fund", id);
    assert_eq!(s.escrow(id).status, Status::Created);

    s.client.fund(&id);
    s.set_time(DEADLINE);
    s.assert_rejects_signer(&s.recipient, "claim_expired", id);
    s.assert_rejects_signer(&s.stranger, "claim_expired", id);
    assert_eq!(s.escrow(id).status, Status::Funded);
    assert_eq!(s.balance(&s.contract), AMOUNT);
}

/// Nobody can create an escrow that spends someone else's money.
#[test]
fn create_requires_payer_signature() {
    let s = Setup::new();
    let (title, terms) = (s.str("t"), s.str(""));
    let args = (
        s.payer.clone(),
        s.recipient.clone(),
        s.usdc.address.clone(),
        AMOUNT,
        DEADLINE,
        title.clone(),
        terms.clone(),
    )
        .into_val(&s.env);
    let result = s.as_signer(&s.stranger, "create_and_fund", args, || {
        s.client.try_create_and_fund(
            &s.payer,
            &s.recipient,
            &s.usdc.address,
            &AMOUNT,
            &DEADLINE,
            &title,
            &terms,
        )
    });
    assert_eq!(result, Err(Err(InvokeError::Abort)));
    assert_eq!(s.balance(&s.payer), PAYER_START);
    assert_eq!(s.client.escrow_count(), 0);
}

/// create_and_fund needs exactly one signature from the payer, covering the
/// call and the USDC transfer into the contract.
#[test]
fn create_and_fund_is_one_payer_signature() {
    let s = Setup::new();
    let (title, terms) = (
        s.str("Logo design"),
        s.str("Three concepts, two revisions."),
    );
    let id = s.client.create_and_fund(
        &s.payer,
        &s.recipient,
        &s.usdc.address,
        &AMOUNT,
        &DEADLINE,
        &title,
        &terms,
    );
    assert_eq!(
        s.env.auths(),
        std::vec![(
            s.payer.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    s.contract.clone(),
                    Symbol::new(&s.env, "create_and_fund"),
                    (
                        s.payer.clone(),
                        s.recipient.clone(),
                        s.usdc.address.clone(),
                        AMOUNT,
                        DEADLINE,
                        title,
                        terms,
                    )
                        .into_val(&s.env),
                )),
                sub_invocations: std::vec![AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        s.usdc.address.clone(),
                        symbol_short!("transfer"),
                        (s.payer.clone(), s.contract.clone(), AMOUNT).into_val(&s.env),
                    )),
                    sub_invocations: std::vec![],
                }],
            }
        )]
    );
    assert_eq!(s.escrow(id).status, Status::Funded);
}

// ===================================================================
// 12. Input validation
// ===================================================================

/// Test 12: Non-allowlisted token, amount 0, payer = recipient, deadline in past,
/// long title, long terms.
#[test]
fn create_validates_inputs() {
    let s = Setup::new();
    let ok_title = s.str("Logo");
    let ok_terms = s.str("");
    let fake_usdc = Setup::new_token(&s.env);

    let try_create = |recipient: &Address,
                      token: &Address,
                      amount: i128,
                      deadline: u64,
                      title: &String,
                      terms: &String| {
        let a = s
            .client
            .try_create(&s.payer, recipient, token, &amount, &deadline, title, terms);
        let b = s
            .client
            .try_create_and_fund(&s.payer, recipient, token, &amount, &deadline, title, terms);
        assert_eq!(a, b, "create and create_and_fund must validate identically");
        a
    };
    let r = &s.recipient;
    let usdc = &s.usdc.address;

    assert_eq!(
        try_create(
            r,
            &fake_usdc.address,
            AMOUNT,
            DEADLINE,
            &ok_title,
            &ok_terms
        ),
        Err(Ok(Error::TokenNotAllowed))
    );
    assert_eq!(
        try_create(r, usdc, 0, DEADLINE, &ok_title, &ok_terms),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        try_create(r, usdc, -1, DEADLINE, &ok_title, &ok_terms),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        try_create(&s.payer, usdc, AMOUNT, DEADLINE, &ok_title, &ok_terms),
        Err(Ok(Error::SameParty))
    );
    assert_eq!(
        try_create(r, usdc, AMOUNT, START, &ok_title, &ok_terms),
        Err(Ok(Error::DeadlineInPast))
    );
    assert_eq!(
        try_create(r, usdc, AMOUNT, START - 1, &ok_title, &ok_terms),
        Err(Ok(Error::DeadlineInPast))
    );

    let title_65 = s.str(&"x".repeat(65));
    assert_eq!(
        try_create(r, usdc, AMOUNT, DEADLINE, &title_65, &ok_terms),
        Err(Ok(Error::TitleTooLong))
    );
    let terms_501 = s.str(&"x".repeat(501));
    assert_eq!(
        try_create(r, usdc, AMOUNT, DEADLINE, &ok_title, &terms_501),
        Err(Ok(Error::TermsTooLong))
    );

    // Nothing was stored or moved by any of the failed calls.
    assert_eq!(s.client.escrow_count(), 0);
    assert_eq!(s.balance(&s.payer), PAYER_START);
}

/// Caps are in bytes and inclusive: exactly 64 / 500 bytes is accepted, and a
/// multi-byte character counts by its UTF-8 length.
#[test]
fn length_caps_are_inclusive_and_in_bytes() {
    let s = Setup::new();
    let title_64 = s.str(&"x".repeat(64));
    let terms_500 = s.str(&"x".repeat(500));
    let id = s.client.create(
        &s.payer,
        &s.recipient,
        &s.usdc.address,
        &AMOUNT,
        &DEADLINE,
        &title_64,
        &terms_500,
    );
    assert_eq!(s.escrow(id).title, title_64);
    assert_eq!(s.escrow(id).terms, terms_500);

    // 22 × "€" (3 bytes) = 66 bytes, only 22 characters.
    let euro_title = s.str(&"€".repeat(22));
    assert_eq!(
        s.client.try_create(
            &s.payer,
            &s.recipient,
            &s.usdc.address,
            &AMOUNT,
            &DEADLINE,
            &euro_title,
            &s.str(""),
        ),
        Err(Ok(Error::TitleTooLong))
    );
}

/// A failed transfer (payer cannot cover the amount) rolls back the whole call:
/// no escrow is created and nothing is left half-funded.
#[test]
fn underfunded_payer_leaves_no_trace() {
    let s = Setup::new();
    let too_much = PAYER_START + 1;
    let result = s.client.try_create_and_fund(
        &s.payer,
        &s.recipient,
        &s.usdc.address,
        &too_much,
        &DEADLINE,
        &s.str("Too big"),
        &s.str(""),
    );
    assert!(result.is_err());
    assert_eq!(s.client.escrow_count(), 0);
    assert_eq!(
        s.client.get_user_escrows(&s.payer),
        (vec![&s.env], vec![&s.env])
    );

    let id = s.client.create(
        &s.payer,
        &s.recipient,
        &s.usdc.address,
        &too_much,
        &DEADLINE,
        &s.str("Too big"),
        &s.str(""),
    );
    assert!(s.client.try_fund(&id).is_err());
    let e = s.escrow(id);
    assert_eq!(e.status, Status::Created);
    assert_eq!(e.funded_at, 0);
    assert_eq!(s.balance(&s.payer), PAYER_START);
}

// ===================================================================
// 13-14. Reads
// ===================================================================

/// Test 13: get_escrow on Funded past deadline → effective_status = Expired.
#[test]
fn effective_status_derives_expiry_on_read() {
    let s = Setup::new();
    let funded = s.create_and_fund();
    let unfunded = s.create();
    let released = s.create_and_fund();
    s.client.release(&released);

    s.set_time(DEADLINE);
    let view = s.client.get_escrow(&funded);
    assert_eq!(
        view.escrow.status,
        Status::Funded,
        "stored status is untouched"
    );
    assert_eq!(view.effective_status, Status::Expired);

    let view = s.client.get_escrow(&unfunded);
    assert_eq!(view.escrow.status, Status::Created);
    assert_eq!(view.effective_status, Status::Expired);

    // Final statuses never change on read.
    assert_eq!(
        s.client.get_escrow(&released).effective_status,
        Status::Released
    );
}

/// Test 14: Index lists: both parties' lists contain the id.
#[test]
fn index_lists_track_both_parties() {
    let s = Setup::new();
    let a = s.create();
    let b = s.create_and_fund();

    // The recipient pays someone else in a third escrow.
    StellarAssetClient::new(&s.env, &s.usdc.address).mint(&s.recipient, &AMOUNT);
    let c = s.client.create_and_fund(
        &s.recipient,
        &s.stranger,
        &s.usdc.address,
        &AMOUNT,
        &DEADLINE,
        &s.str("Sub-contract"),
        &s.str(""),
    );

    assert_eq!(
        s.client.get_user_escrows(&s.payer),
        (vec![&s.env, a, b], vec![&s.env])
    );
    assert_eq!(
        s.client.get_user_escrows(&s.recipient),
        (vec![&s.env, c], vec![&s.env, a, b])
    );
    assert_eq!(
        s.client.get_user_escrows(&s.stranger),
        (vec![&s.env], vec![&s.env, c])
    );
    assert_eq!(
        s.client.get_user_escrows(&s.admin),
        (vec![&s.env], vec![&s.env])
    );
    assert_eq!(s.client.escrow_count(), 3);
}

#[test]
fn get_escrows_batches_in_order_and_skips_unknown_ids() {
    let s = Setup::new();
    let a = s.create();
    let b = s.create_and_fund();
    let views = s.client.get_escrows(&vec![&s.env, b, 99, a]);
    assert_eq!(views.len(), 2);
    assert_eq!(views.get_unchecked(0).escrow.id, b);
    assert_eq!(views.get_unchecked(0).effective_status, Status::Funded);
    assert_eq!(views.get_unchecked(1).escrow.id, a);
    assert_eq!(views.get_unchecked(1).effective_status, Status::Created);
    assert_eq!(s.client.get_escrows(&vec![&s.env]).len(), 0);
}

#[test]
fn escrow_stores_full_terms_and_timestamps() {
    let s = Setup::new();
    let id = s.create();
    assert_eq!(
        s.escrow(id),
        Escrow {
            id,
            payer: s.payer.clone(),
            recipient: s.recipient.clone(),
            token: s.usdc.address.clone(),
            amount: AMOUNT,
            deadline: DEADLINE,
            title: s.str("Logo design"),
            terms: s.str("Three concepts, two revisions."),
            status: Status::Created,
            created_at: START,
            created_ledger: 1_000,
            funded_at: 0,
            closed_at: 0,
        }
    );
}

// ===================================================================
// 15. Admin powers are limited to the allowlist
// ===================================================================

/// Test 15: The admin has no way to move funds, and remove_token does not affect
/// existing escrows.
#[test]
fn admin_cannot_touch_funds_and_delisting_spares_existing_escrows() {
    let s = Setup::new();
    let funded = s.create_and_fund();
    let unfunded = s.create();
    assert_eq!(s.client.admin(), s.admin);

    s.client.remove_token(&s.usdc.address);
    assert_eq!(
        s.hodl_events(),
        [events::TokenRemoved {
            token: s.usdc.address.clone(),
        }
        .to_xdr(&s.env, &s.contract)]
    );
    assert!(!s.client.is_token_allowed(&s.usdc.address));

    // New escrows in the delisted token are blocked...
    assert_eq!(
        s.client.try_create(
            &s.payer,
            &s.recipient,
            &s.usdc.address,
            &AMOUNT,
            &DEADLINE,
            &s.str("x"),
            &s.str(""),
        ),
        Err(Ok(Error::TokenNotAllowed))
    );

    // ...but existing ones keep working, and the admin cannot sign for them.
    s.assert_rejects_signer(&s.admin, "release", funded);
    s.assert_rejects_signer(&s.admin, "refund", funded);
    s.client.fund(&unfunded);
    s.client.release(&funded);
    s.client.refund(&unfunded);
    assert_eq!(s.balance(&s.recipient), AMOUNT);
    assert_eq!(s.balance(&s.payer), PAYER_START - AMOUNT);
    assert_eq!(s.balance(&s.contract), 0);
}

#[test]
fn only_admin_edits_allowlist() {
    let s = Setup::new();
    let eurc = Setup::new_token(&s.env);
    assert!(s.client.is_token_allowed(&s.usdc.address));
    assert!(!s.client.is_token_allowed(&eurc.address));

    let args = (eurc.address.clone(),).into_val(&s.env);
    let result = s.as_signer(&s.stranger, "add_token", args, || {
        s.client.try_add_token(&eurc.address)
    });
    assert_eq!(result, Err(Ok(not_authorized())));
    assert!(!s.client.is_token_allowed(&eurc.address));

    let args = (s.usdc.address.clone(),).into_val(&s.env);
    let result = s.as_signer(&s.stranger, "remove_token", args, || {
        s.client.try_remove_token(&s.usdc.address)
    });
    assert_eq!(result, Err(Ok(not_authorized())));
    assert!(s.client.is_token_allowed(&s.usdc.address));

    let args = (eurc.address.clone(),).into_val(&s.env);
    s.as_signer(&s.admin, "add_token", args, || {
        s.client.add_token(&eurc.address)
    });
    assert_eq!(
        s.hodl_events(),
        [events::TokenAdded {
            token: eurc.address.clone(),
        }
        .to_xdr(&s.env, &s.contract)]
    );
    assert!(s.client.is_token_allowed(&eurc.address));

    // An escrow in the newly allowed token works end to end.
    StellarAssetClient::new(&s.env, &eurc.address).mint(&s.payer, &AMOUNT);
    let id = s.client.create_and_fund(
        &s.payer,
        &s.recipient,
        &eurc.address,
        &AMOUNT,
        &DEADLINE,
        &s.str("EURC job"),
        &s.str(""),
    );
    s.client.release(&id);
    assert_eq!(eurc.balance(&s.recipient), AMOUNT);
    // USDC escrows are unaffected.
    assert_eq!(s.balance(&s.recipient), 0);
}

// ===================================================================
// Accounting, events and storage lifetime
// ===================================================================

/// Each escrow only ever moves its own amount, even with several locked in
/// the same contract balance.
#[test]
fn escrows_are_isolated_from_each_other() {
    let s = Setup::new();
    let a = s.create_and_fund();
    let b = s.create_and_fund();
    let c = s.create_and_fund();
    assert_eq!(s.balance(&s.contract), 3 * AMOUNT);

    s.client.release(&a);
    assert_eq!(s.balance(&s.contract), 2 * AMOUNT);
    s.client.refund(&b);
    assert_eq!(s.balance(&s.contract), AMOUNT);
    assert_eq!(s.escrow(c).status, Status::Funded);

    s.set_time(DEADLINE);
    s.client.claim_expired(&c);
    assert_eq!(s.balance(&s.contract), 0);
    assert_eq!(s.balance(&s.recipient), AMOUNT);
    assert_eq!(s.balance(&s.payer), PAYER_START - AMOUNT);
}

#[test]
fn create_and_fund_emits_created_then_funded() {
    let s = Setup::new();
    let id = s.create_and_fund();
    assert_eq!(
        s.hodl_events(),
        [
            events::Created {
                id,
                payer: s.payer.clone(),
                recipient: s.recipient.clone(),
                token: s.usdc.address.clone(),
                amount: AMOUNT,
                deadline: DEADLINE,
            }
            .to_xdr(&s.env, &s.contract),
            events::Funded {
                id,
                payer: s.payer.clone(),
                amount: AMOUNT,
            }
            .to_xdr(&s.env, &s.contract),
        ]
    );
}

/// Topics are exactly ("hodl", <action>, id) so the UI can filter one
/// escrow's history with ("hodl", *, id).
#[test]
fn event_topics_are_hodl_action_id() {
    let s = Setup::new();
    let id = s.create();
    let topics: soroban_sdk::Vec<Val> = (
        Symbol::new(&s.env, "hodl"),
        Symbol::new(&s.env, "created"),
        id,
    )
        .into_val(&s.env);
    let event = events::Created {
        id,
        payer: s.payer.clone(),
        recipient: s.recipient.clone(),
        token: s.usdc.address.clone(),
        amount: AMOUNT,
        deadline: DEADLINE,
    };
    assert_eq!(event.topics(&s.env), topics);
    assert_eq!(s.hodl_events(), [event.to_xdr(&s.env, &s.contract)]);
}

/// Writes extend the TTL of every entry they touch, so a long-running escrow
/// is not archived mid-deal.
#[test]
fn writes_extend_storage_ttl() {
    let s = Setup::new();
    let id = s.create();
    s.env.as_contract(&s.contract, || {
        let storage = s.env.storage();
        assert_eq!(storage.instance().get_ttl(), INSTANCE_EXTEND_TO);
        assert_eq!(
            storage.persistent().get_ttl(&DataKey::Escrow(id)),
            PERSISTENT_EXTEND_TO
        );
        assert_eq!(
            storage
                .persistent()
                .get_ttl(&DataKey::ByPayer(s.payer.clone())),
            PERSISTENT_EXTEND_TO
        );
        assert_eq!(
            storage
                .persistent()
                .get_ttl(&DataKey::ByRecipient(s.recipient.clone())),
            PERSISTENT_EXTEND_TO
        );
    });

    // 60 days later the escrow entry has been bumped back up by fund.
    let sixty_days = 60 * 17_280;
    s.env.ledger().with_mut(|l| l.sequence_number += sixty_days);
    s.client.fund(&id);
    s.env.as_contract(&s.contract, || {
        assert_eq!(
            s.env.storage().persistent().get_ttl(&DataKey::Escrow(id)),
            PERSISTENT_EXTEND_TO
        );
        assert_eq!(s.env.storage().instance().get_ttl(), INSTANCE_EXTEND_TO);
    });
}

// ===================================================================
// Upgrades (UUPS-style) and admin handover
// ===================================================================

/// A stand-in "v2": reports version 2 and reads the escrow counter through
/// the same storage key. Built from contracts/upgrade-fixture.
mod v2 {
    soroban_sdk::contractimport!(file = "testdata/upgrade_fixture.wasm");
}

/// The upgrade keeps the contract address, its storage and its locked funds.
#[test]
fn admin_upgrade_keeps_address_storage_and_funds() {
    let s = Setup::new();
    s.create_and_fund();
    s.create();
    assert_eq!(s.client.version(), VERSION);
    assert!(s.client.upgrades_enabled());

    let hash = s.env.deployer().upload_contract_wasm(v2::WASM);
    let events = s.as_signer(
        &s.admin,
        "upgrade",
        (hash.clone(),).into_val(&s.env),
        || {
            s.client.upgrade(&hash);
            s.hodl_events()
        },
    );
    assert_eq!(
        events,
        [events::Upgraded {
            new_wasm_hash: hash.clone(),
            from_version: VERSION,
        }
        .to_xdr(&s.env, &s.contract)]
    );

    // Same address, new code, old storage, same funds.
    let upgraded = v2::Client::new(&s.env, &s.contract);
    assert_eq!(upgraded.version(), 2);
    assert_eq!(upgraded.escrow_count(), 2);
    assert_eq!(s.balance(&s.contract), AMOUNT);
}

#[test]
fn only_admin_can_upgrade() {
    let s = Setup::new();
    let id = s.create_and_fund();
    let hash = s.env.deployer().upload_contract_wasm(v2::WASM);
    for who in [&s.payer, &s.recipient, &s.stranger] {
        let result = s.as_signer(who, "upgrade", (hash.clone(),).into_val(&s.env), || {
            s.client.try_upgrade(&hash)
        });
        assert_eq!(result, Err(Err(InvokeError::Abort)));
    }
    assert_eq!(s.client.version(), VERSION);
    assert_eq!(s.escrow(id).status, Status::Funded);
}

/// After `lock_upgrades` nobody can change the code again, not even a new
/// admin, while escrows keep working.
#[test]
fn lock_upgrades_is_permanent() {
    let s = Setup::new();
    let id = s.create_and_fund();
    let hash = s.env.deployer().upload_contract_wasm(v2::WASM);

    let result = s.as_signer(&s.stranger, "lock_upgrades", vec![&s.env], || {
        s.client.try_lock_upgrades()
    });
    assert_eq!(result, Err(Err(InvokeError::Abort)));
    assert!(s.client.upgrades_enabled());

    let events = s.as_signer(&s.admin, "lock_upgrades", vec![&s.env], || {
        s.client.lock_upgrades();
        s.hodl_events()
    });
    assert_eq!(
        events,
        [events::UpgradesLocked {}.to_xdr(&s.env, &s.contract)]
    );
    assert!(!s.client.upgrades_enabled());
    assert_eq!(s.client.try_upgrade(&hash), Err(Ok(Error::UpgradesLocked)));
    assert_eq!(s.client.try_lock_upgrades(), Err(Ok(Error::UpgradesLocked)));

    // A new admin inherits the lock.
    s.client.propose_admin(&s.stranger);
    s.client.accept_admin();
    assert_eq!(s.client.admin(), s.stranger);
    assert_eq!(s.client.try_upgrade(&hash), Err(Ok(Error::UpgradesLocked)));
    assert_eq!(s.client.version(), VERSION);

    s.client.release(&id);
    assert_eq!(s.balance(&s.recipient), AMOUNT);
}

/// Like Ownable2Step: the role only moves when the proposed address accepts,
/// and the old admin loses every power at that moment.
#[test]
fn admin_handover_is_two_step() {
    let s = Setup::new();
    let new_admin = Address::generate(&s.env);
    let eurc = Setup::new_token(&s.env);
    let no_args = || soroban_sdk::Vec::<Val>::new(&s.env);
    assert_eq!(s.client.pending_admin(), None);
    assert_eq!(s.client.try_accept_admin(), Err(Ok(Error::NoPendingAdmin)));

    // Only the admin proposes.
    let result = s.as_signer(
        &s.stranger,
        "propose_admin",
        (new_admin.clone(),).into_val(&s.env),
        || s.client.try_propose_admin(&new_admin),
    );
    assert_eq!(result, Err(Ok(not_authorized())));

    let events = s.as_signer(
        &s.admin,
        "propose_admin",
        (new_admin.clone(),).into_val(&s.env),
        || {
            s.client.propose_admin(&new_admin);
            s.hodl_events()
        },
    );
    assert_eq!(
        events,
        [events::AdminProposed {
            new_admin: new_admin.clone(),
        }
        .to_xdr(&s.env, &s.contract)]
    );
    assert_eq!(s.client.pending_admin(), Some(new_admin.clone()));
    assert_eq!(s.client.admin(), s.admin, "nothing changes until accepted");

    // Only the proposed address accepts.
    for who in [&s.stranger, &s.admin] {
        let result = s.as_signer(who, "accept_admin", no_args(), || {
            s.client.try_accept_admin()
        });
        assert_eq!(result, Err(Err(InvokeError::Abort)));
    }
    let events = s.as_signer(&new_admin, "accept_admin", no_args(), || {
        s.client.accept_admin();
        s.hodl_events()
    });
    assert_eq!(
        events,
        [events::AdminChanged {
            new_admin: new_admin.clone(),
            previous_admin: s.admin.clone(),
        }
        .to_xdr(&s.env, &s.contract)]
    );
    assert_eq!(s.client.admin(), new_admin);
    assert_eq!(s.client.pending_admin(), None);

    // The old admin is now powerless; the new one has every admin power.
    let args = (eurc.address.clone(),).into_val(&s.env);
    let result = s.as_signer(&s.admin, "add_token", args, || {
        s.client.try_add_token(&eurc.address)
    });
    assert_eq!(result, Err(Ok(not_authorized())));
    let hash = s.env.deployer().upload_contract_wasm(v2::WASM);
    let result = s.as_signer(
        &s.admin,
        "upgrade",
        (hash.clone(),).into_val(&s.env),
        || s.client.try_upgrade(&hash),
    );
    assert_eq!(result, Err(Err(InvokeError::Abort)));

    let args = (eurc.address.clone(),).into_val(&s.env);
    s.as_signer(&new_admin, "add_token", args, || {
        s.client.add_token(&eurc.address)
    });
    assert!(s.client.is_token_allowed(&eurc.address));
}
