import {EscrowView, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Locks the escrow amount: payer → contract. Status becomes `Funded`.
   *
   * Signer: `payer`. Allowed when `Created` and before the deadline.
   */
  fund(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * The admin: edits the allowlist and authorizes upgrades.
   */
  admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Creates an escrow in `Created` status. Nothing is locked yet; call
   * `fund` next, or use `create_and_fund` to do both in one transaction.
   *
   * Signer: `payer`. Returns the new escrow id.
   */
  create(args: { payer: string | Address; recipient: string | Address; token: string | Address; amount: bigint; deadline: bigint; title: string; terms: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * The recipient sends the locked amount back: contract → payer.
   * Status becomes `Refunded`. Final.
   *
   * Signer: `recipient`. Allowed when `Funded`, including after the deadline.
   */
  refund(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Pays the locked amount to the recipient: contract → recipient.
   * Status becomes `Released`. Final.
   *
   * Signer: `payer`. Allowed when `Funded`, including after the deadline
   * ("release anyway").
   */
  release(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Replaces this contract's code with already-uploaded wasm, like UUPS
   * `upgradeTo`. The address, all storage and all locked funds stay the
   * same; the new code runs from the next call. Signer: admin.
   *
   * Upload the wasm first (`stellar contract upload`) and pass its hash.
   */
  upgrade(args: { new_wasm_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Version of the code currently running.
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Allowlists a token for new escrows. Signer: admin.
   */
  add_token(args: { token: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * One escrow plus its `effective_status`.
   */
  get_escrow(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<EscrowView, Error>>>;
  /**
   * Batch read for the dashboard, in the order given. Ids that do not
   * exist are skipped rather than failing the whole call.
   */
  get_escrows(args: { ids: Array<bigint> }, options?: MethodOptions): Promise<AssembledTransaction<Array<EscrowView>>>;
  /**
   * Step two of an admin handover. Signer: the pending admin.
   */
  accept_admin(options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Number of escrows ever created. Ids run from 1 to this value.
   */
  escrow_count(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Removes a token from the allowlist. Only blocks new escrows; existing
   * ones are unaffected. Signer: admin.
   */
  remove_token(args: { token: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Closes an escrow whose deadline has passed. If it was funded, the
   * locked amount goes back to the payer. Status becomes `Expired`. Final.
   *
   * Signer: `payer`. Allowed when `Created` or `Funded`, at or after the
   * deadline.
   */
  claim_expired(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Freezes the code permanently: `upgrade` fails from now on, for every
   * admin. Cannot be undone. Signer: admin.
   */
  lock_upgrades(options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * The address `propose_admin` named, until it calls `accept_admin`.
   */
  pending_admin(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Step one of an admin handover. Nothing changes until `new_admin` calls
   * `accept_admin`, so a typo cannot lose the admin role. Proposing again
   * replaces the pending admin. Signer: current admin.
   */
  propose_admin(args: { new_admin: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * `create` and `fund` in one transaction with one signature. This is
   * the default path in the UI.
   *
   * Signer: `payer`. Returns the new escrow id.
   */
  create_and_fund(args: { payer: string | Address; recipient: string | Address; token: string | Address; amount: bigint; deadline: bigint; title: string; terms: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * `(paying, receiving)` escrow ids for an address, oldest first.
   */
  get_user_escrows(args: { addr: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<[Array<bigint>, Array<bigint>]>>;
  /**
   * Whether new escrows may be created in `token`.
   */
  is_token_allowed(args: { token: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * `false` once `lock_upgrades` has been called; the code is then final.
   */
  upgrades_enabled(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAAAAAAAIdMb2NrcyB0aGUgZXNjcm93IGFtb3VudDogcGF5ZXIg4oaSIGNvbnRyYWN0LiBTdGF0dXMgYmVjb21lcyBgRnVuZGVkYC4KClNpZ25lcjogYHBheWVyYC4gQWxsb3dlZCB3aGVuIGBDcmVhdGVkYCBhbmQgYmVmb3JlIHRoZSBkZWFkbGluZS4AAAAABGZ1bmQAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAADdUaGUgYWRtaW46IGVkaXRzIHRoZSBhbGxvd2xpc3QgYW5kIGF1dGhvcml6ZXMgdXBncmFkZXMuAAAAAAVhZG1pbgAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAALRDcmVhdGVzIGFuIGVzY3JvdyBpbiBgQ3JlYXRlZGAgc3RhdHVzLiBOb3RoaW5nIGlzIGxvY2tlZCB5ZXQ7IGNhbGwKYGZ1bmRgIG5leHQsIG9yIHVzZSBgY3JlYXRlX2FuZF9mdW5kYCB0byBkbyBib3RoIGluIG9uZSB0cmFuc2FjdGlvbi4KClNpZ25lcjogYHBheWVyYC4gUmV0dXJucyB0aGUgbmV3IGVzY3JvdyBpZC4AAAAGY3JlYXRlAAAAAAAHAAAAAAAAAAVwYXllcgAAAAAAABMAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAhkZWFkbGluZQAAAAYAAAAAAAAABXRpdGxlAAAAAAAAEAAAAAAAAAAFdGVybXMAAAAAAAAQAAAAAQAAA+kAAAAGAAAAAw==", "AAAAAAAAAKxUaGUgcmVjaXBpZW50IHNlbmRzIHRoZSBsb2NrZWQgYW1vdW50IGJhY2s6IGNvbnRyYWN0IOKGkiBwYXllci4KU3RhdHVzIGJlY29tZXMgYFJlZnVuZGVkYC4gRmluYWwuCgpTaWduZXI6IGByZWNpcGllbnRgLiBBbGxvd2VkIHdoZW4gYEZ1bmRlZGAsIGluY2x1ZGluZyBhZnRlciB0aGUgZGVhZGxpbmUuAAAABnJlZnVuZAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAALxQYXlzIHRoZSBsb2NrZWQgYW1vdW50IHRvIHRoZSByZWNpcGllbnQ6IGNvbnRyYWN0IOKGkiByZWNpcGllbnQuClN0YXR1cyBiZWNvbWVzIGBSZWxlYXNlZGAuIEZpbmFsLgoKU2lnbmVyOiBgcGF5ZXJgLiBBbGxvd2VkIHdoZW4gYEZ1bmRlZGAsIGluY2x1ZGluZyBhZnRlciB0aGUgZGVhZGxpbmUKKCJyZWxlYXNlIGFueXdheSIpLgAAAAdyZWxlYXNlAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAQhSZXBsYWNlcyB0aGlzIGNvbnRyYWN0J3MgY29kZSB3aXRoIGFscmVhZHktdXBsb2FkZWQgd2FzbSwgbGlrZSBVVVBTCmB1cGdyYWRlVG9gLiBUaGUgYWRkcmVzcywgYWxsIHN0b3JhZ2UgYW5kIGFsbCBsb2NrZWQgZnVuZHMgc3RheSB0aGUKc2FtZTsgdGhlIG5ldyBjb2RlIHJ1bnMgZnJvbSB0aGUgbmV4dCBjYWxsLiBTaWduZXI6IGFkbWluLgoKVXBsb2FkIHRoZSB3YXNtIGZpcnN0IChgc3RlbGxhciBjb250cmFjdCB1cGxvYWRgKSBhbmQgcGFzcyBpdHMgaGFzaC4AAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAACZWZXJzaW9uIG9mIHRoZSBjb2RlIGN1cnJlbnRseSBydW5uaW5nLgAAAAAAB3ZlcnNpb24AAAAAAAAAAAEAAAAE", "AAAAAAAAADJBbGxvd2xpc3RzIGEgdG9rZW4gZm9yIG5ldyBlc2Nyb3dzLiBTaWduZXI6IGFkbWluLgAAAAAACWFkZF90b2tlbgAAAAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAA=", "AAAAAAAAACdPbmUgZXNjcm93IHBsdXMgaXRzIGBlZmZlY3RpdmVfc3RhdHVzYC4AAAAACmdldF9lc2Nyb3cAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+kAAAfQAAAACkVzY3Jvd1ZpZXcAAAAAAAM=", "AAAAAAAAAHdCYXRjaCByZWFkIGZvciB0aGUgZGFzaGJvYXJkLCBpbiB0aGUgb3JkZXIgZ2l2ZW4uIElkcyB0aGF0IGRvIG5vdApleGlzdCBhcmUgc2tpcHBlZCByYXRoZXIgdGhhbiBmYWlsaW5nIHRoZSB3aG9sZSBjYWxsLgAAAAALZ2V0X2VzY3Jvd3MAAAAAAQAAAAAAAAADaWRzAAAAA+oAAAAGAAAAAQAAA+oAAAfQAAAACkVzY3Jvd1ZpZXcAAA==", "AAAAAAAAADlTdGVwIHR3byBvZiBhbiBhZG1pbiBoYW5kb3Zlci4gU2lnbmVyOiB0aGUgcGVuZGluZyBhZG1pbi4AAAAAAAAMYWNjZXB0X2FkbWluAAAAAAAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAD1OdW1iZXIgb2YgZXNjcm93cyBldmVyIGNyZWF0ZWQuIElkcyBydW4gZnJvbSAxIHRvIHRoaXMgdmFsdWUuAAAAAAAADGVzY3Jvd19jb3VudAAAAAAAAAABAAAABg==", "AAAAAAAAAGlSZW1vdmVzIGEgdG9rZW4gZnJvbSB0aGUgYWxsb3dsaXN0LiBPbmx5IGJsb2NrcyBuZXcgZXNjcm93czsgZXhpc3RpbmcKb25lcyBhcmUgdW5hZmZlY3RlZC4gU2lnbmVyOiBhZG1pbi4AAAAAAAAMcmVtb3ZlX3Rva2VuAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAA==", "AAAAAAAAAGtSdW5zIG9uY2UsIGF0b21pY2FsbHkgd2l0aCBkZXBsb3kuIFNldHMgdGhlIGFsbG93bGlzdCBhZG1pbiBhbmQKYWxsb3dsaXN0cyB0aGUgVVNEQyBTdGVsbGFyIEFzc2V0IENvbnRyYWN0LgAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAEdXNkYwAAABMAAAAA", "AAAAAAAAANhDbG9zZXMgYW4gZXNjcm93IHdob3NlIGRlYWRsaW5lIGhhcyBwYXNzZWQuIElmIGl0IHdhcyBmdW5kZWQsIHRoZQpsb2NrZWQgYW1vdW50IGdvZXMgYmFjayB0byB0aGUgcGF5ZXIuIFN0YXR1cyBiZWNvbWVzIGBFeHBpcmVkYC4gRmluYWwuCgpTaWduZXI6IGBwYXllcmAuIEFsbG93ZWQgd2hlbiBgQ3JlYXRlZGAgb3IgYEZ1bmRlZGAsIGF0IG9yIGFmdGVyIHRoZQpkZWFkbGluZS4AAAANY2xhaW1fZXhwaXJlZAAAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAGxGcmVlemVzIHRoZSBjb2RlIHBlcm1hbmVudGx5OiBgdXBncmFkZWAgZmFpbHMgZnJvbSBub3cgb24sIGZvciBldmVyeQphZG1pbi4gQ2Fubm90IGJlIHVuZG9uZS4gU2lnbmVyOiBhZG1pbi4AAAANbG9ja191cGdyYWRlcwAAAAAAAAAAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAEFUaGUgYWRkcmVzcyBgcHJvcG9zZV9hZG1pbmAgbmFtZWQsIHVudGlsIGl0IGNhbGxzIGBhY2NlcHRfYWRtaW5gLgAAAAAAAA1wZW5kaW5nX2FkbWluAAAAAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAAL9TdGVwIG9uZSBvZiBhbiBhZG1pbiBoYW5kb3Zlci4gTm90aGluZyBjaGFuZ2VzIHVudGlsIGBuZXdfYWRtaW5gIGNhbGxzCmBhY2NlcHRfYWRtaW5gLCBzbyBhIHR5cG8gY2Fubm90IGxvc2UgdGhlIGFkbWluIHJvbGUuIFByb3Bvc2luZyBhZ2FpbgpyZXBsYWNlcyB0aGUgcGVuZGluZyBhZG1pbi4gU2lnbmVyOiBjdXJyZW50IGFkbWluLgAAAAANcHJvcG9zZV9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA", "AAAAAAAAAItgY3JlYXRlYCBhbmQgYGZ1bmRgIGluIG9uZSB0cmFuc2FjdGlvbiB3aXRoIG9uZSBzaWduYXR1cmUuIFRoaXMgaXMKdGhlIGRlZmF1bHQgcGF0aCBpbiB0aGUgVUkuCgpTaWduZXI6IGBwYXllcmAuIFJldHVybnMgdGhlIG5ldyBlc2Nyb3cgaWQuAAAAAA9jcmVhdGVfYW5kX2Z1bmQAAAAABwAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAAAAAAV0aXRsZQAAAAAAABAAAAAAAAAABXRlcm1zAAAAAAAAEAAAAAEAAAPpAAAABgAAAAM=", "AAAAAAAAAD5gKHBheWluZywgcmVjZWl2aW5nKWAgZXNjcm93IGlkcyBmb3IgYW4gYWRkcmVzcywgb2xkZXN0IGZpcnN0LgAAAAAAEGdldF91c2VyX2VzY3Jvd3MAAAABAAAAAAAAAARhZGRyAAAAEwAAAAEAAAPtAAAAAgAAA+oAAAAGAAAD6gAAAAY=", "AAAAAAAAAC5XaGV0aGVyIG5ldyBlc2Nyb3dzIG1heSBiZSBjcmVhdGVkIGluIGB0b2tlbmAuAAAAAAAQaXNfdG9rZW5fYWxsb3dlZAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAB", "AAAAAAAAAEVgZmFsc2VgIG9uY2UgYGxvY2tfdXBncmFkZXNgIGhhcyBiZWVuIGNhbGxlZDsgdGhlIGNvZGUgaXMgdGhlbiBmaW5hbC4AAAAAAAAQdXBncmFkZXNfZW5hYmxlZAAAAAAAAAABAAAAAQ==", "AAAAAQAAAAAAAAAAAAAABkVzY3JvdwAAAAAADQAAAC9TbWFsbGVzdCB1bml0IG9mIHRoZSB0b2tlbiAoVVNEQyA9IDcgZGVjaW1hbHMpLgAAAAAGYW1vdW50AAAAAAALAAAAJjAgdW50aWwgUmVsZWFzZWQsIFJlZnVuZGVkIG9yIEV4cGlyZWQuAAAAAAAJY2xvc2VkX2F0AAAAAAAABgAAAAAAAAAKY3JlYXRlZF9hdAAAAAAABgAAAEZMZWRnZXIgdGhlIGVzY3JvdyB3YXMgY3JlYXRlZCBpbjsgd2hlcmUgdGhlIFVJIHN0YXJ0cyBzY2FubmluZyBldmVudHMuAAAAAAAOY3JlYXRlZF9sZWRnZXIAAAAAAAQAAAAaTGVkZ2VyIHRpbWVzdGFtcCwgc2Vjb25kcy4AAAAAAAhkZWFkbGluZQAAAAYAAAAPMCB1bnRpbCBmdW5kZWQuAAAAAAlmdW5kZWRfYXQAAAAAAAAGAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAASVN0b3JlZCBzdGF0dXMuIFNlZSBgRXNjcm93Vmlldzo6ZWZmZWN0aXZlX3N0YXR1c2AgZm9yIHdoYXQgdG8gc2hvdyB1c2Vycy4AAAAAAAAGc3RhdHVzAAAAAAfQAAAABlN0YXR1cwAAAAAAH01heCA1MDAgYnl0ZXMsIHdoYXQgd2FzIGFncmVlZC4AAAAABXRlcm1zAAAAAAAAEAAAAA1NYXggNjQgYnl0ZXMuAAAAAAAABXRpdGxlAAAAAAAAEAAAAEdNdXN0IGJlIG9uIHRoZSBhbGxvd2xpc3Qgd2hlbiB0aGUgZXNjcm93IGlzIGNyZWF0ZWQgKFRlc3RuZXQgVVNEQyBTQUMpLgAAAAAFdG9rZW4AAAAAAAAT", "AAAAAgAAAVdMaWZlY3ljbGUgb2YgYW4gZXNjcm93LiBTdGF0dXMgb25seSBldmVyIG1vdmVzIGZvcndhcmQ6CgpgYGB0ZXh0CkNyZWF0ZWQg4pSA4pSAZnVuZOKUgOKUgOKWtiBGdW5kZWQg4pSA4pSAcmVsZWFzZeKUgOKUgOKWtiBSZWxlYXNlZArilIIgICAgICAgICAgICAgICAgIOKUnOKUgOKUgOKUgOKUgHJlZnVuZOKUgOKUgOKUgOKUgOKWtiBSZWZ1bmRlZArilIIgICAgICAgICAgICAgICAgIOKUlOKUgGNsYWltX2V4cGlyZWTilIDilrYgRXhwaXJlZArilJTilIDilIDilIDilIDilIDilIDilIBjbGFpbV9leHBpcmVk4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pa2IEV4cGlyZWQKYGBgAAAAAAAAAAAGU3RhdHVzAAAAAAAFAAAAAAAAACNBZ3JlZW1lbnQgbWFkZSwgbm90aGluZyBsb2NrZWQgeWV0LgAAAAAHQ3JlYXRlZAAAAAAAAAAAJVRoZSBhbW91bnQgaXMgbG9ja2VkIGluIHRoZSBjb250cmFjdC4AAAAAAAAGRnVuZGVkAAAAAAAAAAAAIVBhaWQgb3V0IHRvIHRoZSByZWNpcGllbnQuIEZpbmFsLgAAAAAAAAhSZWxlYXNlZAAAAAAAAAAvU2VudCBiYWNrIHRvIHRoZSBwYXllciBieSB0aGUgcmVjaXBpZW50LiBGaW5hbC4AAAAACFJlZnVuZGVkAAAAAAAAAEpDbG9zZWQgYWZ0ZXIgdGhlIGRlYWRsaW5lOyBhbnkgbG9ja2VkIGZ1bmRzIHdlbnQgYmFjayB0byB0aGUgcGF5ZXIuIEZpbmFsLgAAAAAAB0V4cGlyZWQA", "AAAAAQAAAVBXaGF0IHJlYWQgY2FsbHMgcmV0dXJuOiB0aGUgc3RvcmVkIGVzY3JvdyBwbHVzIHRoZSBzdGF0dXMgYSB1c2VyIHNob3VsZCBzZWUuCgpgZWZmZWN0aXZlX3N0YXR1c2AgaXMgYEV4cGlyZWRgIHdoZW4gdGhlIHN0b3JlZCBzdGF0dXMgaXMgYENyZWF0ZWRgIG9yCmBGdW5kZWRgIGFuZCB0aGUgZGVhZGxpbmUgaGFzIHBhc3NlZCwgc28gbm8gY3JvbiBqb2IgaXMgbmVlZGVkIHRvIGV4cGlyZQplc2Nyb3dzLiBGdW5kcyBzdGF5IGxvY2tlZCB1bnRpbCBzb21lb25lIGNhbGxzIGBjbGFpbV9leHBpcmVkYCAocGF5ZXIpLApgcmVsZWFzZWAgKHBheWVyKSBvciBgcmVmdW5kYCAocmVjaXBpZW50KS4AAAAAAAAACkVzY3Jvd1ZpZXcAAAAAAAIAAAAAAAAAEGVmZmVjdGl2ZV9zdGF0dXMAAAfQAAAABlN0YXR1cwAAAAAAAAAAAAZlc2Nyb3cAAAAAB9AAAAAGRXNjcm93AAA=", "AAAABAAAAL5Db250cmFjdCBlcnJvciBjb2Rlcy4gVGhlIGZyb250ZW5kIG1hcHMgZWFjaCBjb2RlIHRvIGEgcGxhaW4gbWVzc2FnZS4KClVuYXV0aG9yaXplZCBjYWxsZXJzIG5ldmVyIHJlYWNoIHRoZXNlOiBgcmVxdWlyZV9hdXRoKClgIGZhaWxzIGZpcnN0IGFuZAp0aGUgdHJhbnNhY3Rpb24gYWJvcnRzIHdpdGggYSBob3N0IGF1dGggZXJyb3IuAAAAAAAAAAAABUVycm9yAAAAAAAADAAAABdObyBlc2Nyb3cgd2l0aCB0aGlzIGlkLgAAAAAITm90Rm91bmQAAAABAAAAflRoZSBlc2Nyb3cgaXMgbm90IGluIGEgc3RhdHVzIHRoYXQgYWxsb3dzIHRoaXMgYWN0aW9uCihkdXBsaWNhdGUgcmVsZWFzZSBvciByZWZ1bmQsIGZ1bmRpbmcgdHdpY2UsIGFjdGluZyBvbiBhIGNsb3NlZCBlc2Nyb3cpLgAAAAAADUludmFsaWRTdGF0dXMAAAAAAAACAAAAIUFtb3VudCBtdXN0IGJlIGdyZWF0ZXIgdGhhbiB6ZXJvLgAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAAAwAAADBQYXllciBhbmQgcmVjaXBpZW50IG11c3QgYmUgZGlmZmVyZW50IGFkZHJlc3Nlcy4AAAAJU2FtZVBhcnR5AAAAAAAABAAAAC1EZWFkbGluZSBtdXN0IGJlIGluIHRoZSBmdXR1cmUgd2hlbiBjcmVhdGluZy4AAAAAAAAORGVhZGxpbmVJblBhc3QAAAAAAAUAAAAnVHJpZWQgdG8gZnVuZCBhdCBvciBhZnRlciB0aGUgZGVhZGxpbmUuAAAAAA5EZWFkbGluZVBhc3NlZAAAAAAABgAAACNUcmllZCB0byBjbGFpbSBiZWZvcmUgdGhlIGRlYWRsaW5lLgAAAAASRGVhZGxpbmVOb3RSZWFjaGVkAAAAAAAHAAAAHlRva2VuIGlzIG5vdCBvbiB0aGUgYWxsb3dsaXN0LgAAAAAAD1Rva2VuTm90QWxsb3dlZAAAAAAIAAAAHlRpdGxlIGlzIGxvbmdlciB0aGFuIDY0IGJ5dGVzLgAAAAAADFRpdGxlVG9vTG9uZwAAAAkAAAAgVGVybXMgYXJlIGxvbmdlciB0aGFuIDUwMCBieXRlcy4AAAAMVGVybXNUb29Mb25nAAAACgAAADpgbG9ja191cGdyYWRlc2AgaGFzIHJ1biwgc28gdGhlIGNvZGUgY2FuIG5vIGxvbmdlciBjaGFuZ2UuAAAAAAAOVXBncmFkZXNMb2NrZWQAAAAAAAsAAAAxYGFjY2VwdF9hZG1pbmAgd2FzIGNhbGxlZCB3aXRoIG5vIGFkbWluIHByb3Bvc2VkLgAAAAAAAA5Ob1BlbmRpbmdBZG1pbgAAAAAADA==", "AAAABQAAAAAAAAAAAAAABkZ1bmRlZAAAAAAAAgAAAARob2RsAAAABmZ1bmRlZAAAAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAVwYXllcgAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAB0NyZWF0ZWQAAAAAAgAAAARob2RsAAAAB2NyZWF0ZWQAAAAABgAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAVwYXllcgAAAAAAABMAAAAAAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAB0V4cGlyZWQAAAAAAgAAAARob2RsAAAAB2V4cGlyZWQAAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAVwYXllcgAAAAAAABMAAAAAAAAAP0Ftb3VudCByZXR1cm5lZCB0byB0aGUgcGF5ZXI7IDAgaWYgdGhlIGVzY3JvdyB3YXMgbmV2ZXIgZnVuZGVkLgAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAACFJlZnVuZGVkAAAAAgAAAARob2RsAAAACHJlZnVuZGVkAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAVwYXllcgAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAACFJlbGVhc2VkAAAAAgAAAARob2RsAAAACHJlbGVhc2VkAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=", "AAAABQAAADtUaGUgY29kZSBpcyBiZWluZyByZXBsYWNlZC4gVG9waWNzOiBgKCJob2RsIiwgInVwZ3JhZGVkIilgLgAAAAAAAAAACFVwZ3JhZGVkAAAAAgAAAARob2RsAAAACHVwZ3JhZGVkAAAAAgAAAAAAAAANbmV3X3dhc21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAC9WZXJzaW9uIG9mIHRoZSBjb2RlIHRoYXQgcGVyZm9ybWVkIHRoZSB1cGdyYWRlLgAAAAAMZnJvbV92ZXJzaW9uAAAABAAAAAAAAAAC", "AAAABQAAAGRBbGxvd2xpc3QgY2hhbmdlcywgc28gYW55b25lIGNhbiBhdWRpdCB3aGF0IHRoZSBhZG1pbiBkaWQuClRvcGljczogYCgiaG9kbCIsICJ0b2tlbl9hZGRlZCIsIHRva2VuKWAuAAAAAAAAAApUb2tlbkFkZGVkAAAAAAACAAAABGhvZGwAAAALdG9rZW5fYWRkZWQAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAE=", "AAAABQAAAC9Ub3BpY3M6IGAoImhvZGwiLCAiYWRtaW5fY2hhbmdlZCIsIG5ld19hZG1pbilgLgAAAAAAAAAADEFkbWluQ2hhbmdlZAAAAAIAAAAEaG9kbAAAAA1hZG1pbl9jaGFuZ2VkAAAAAAAAAgAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAAAAAADnByZXZpb3VzX2FkbWluAAAAAAATAAAAAAAAAAI=", "AAAABQAAACtUb3BpY3M6IGAoImhvZGwiLCAidG9rZW5fcmVtb3ZlZCIsIHRva2VuKWAuAAAAAAAAAAAMVG9rZW5SZW1vdmVkAAAAAgAAAARob2RsAAAADXRva2VuX3JlbW92ZWQAAAAAAAABAAAAAAAAAAV0b2tlbgAAAAAAABMAAAABAAAAAQ==", "AAAABQAAADBUb3BpY3M6IGAoImhvZGwiLCAiYWRtaW5fcHJvcG9zZWQiLCBuZXdfYWRtaW4pYC4AAAAAAAAADUFkbWluUHJvcG9zZWQAAAAAAAACAAAABGhvZGwAAAAOYWRtaW5fcHJvcG9zZWQAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAAAQ==", "AAAABQAAAE1VcGdyYWRlcyBhcmUgbm93IHBlcm1hbmVudGx5IGRpc2FibGVkLiBUb3BpY3M6IGAoImhvZGwiLCAidXBncmFkZXNfbG9ja2VkIilgLgAAAAAAAAAAAAAOVXBncmFkZXNMb2NrZWQAAAAAAAIAAAAEaG9kbAAAAA91cGdyYWRlc19sb2NrZWQAAAAAAAAAAAE="]),
      options
    );
  }

   static deploy<T = Client>(args: { admin: string | Address; usdc: string | Address }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(args, options);
  }
  public readonly fromJson = {
    fund : this.txFromJson<Result<null, Error>>,  admin : this.txFromJson<string>,  create : this.txFromJson<Result<bigint, Error>>,  refund : this.txFromJson<Result<null, Error>>,  release : this.txFromJson<Result<null, Error>>,  upgrade : this.txFromJson<Result<null, Error>>,  version : this.txFromJson<number>,  add_token : this.txFromJson<void>,  get_escrow : this.txFromJson<Result<EscrowView, Error>>,  get_escrows : this.txFromJson<Array<EscrowView>>,  accept_admin : this.txFromJson<Result<null, Error>>,  escrow_count : this.txFromJson<bigint>,  remove_token : this.txFromJson<void>,  claim_expired : this.txFromJson<Result<null, Error>>,  lock_upgrades : this.txFromJson<Result<null, Error>>,  pending_admin : this.txFromJson<string | null>,  propose_admin : this.txFromJson<void>,  create_and_fund : this.txFromJson<Result<bigint, Error>>,  get_user_escrows : this.txFromJson<[Array<bigint>, Array<bigint>]>,  is_token_allowed : this.txFromJson<boolean>,  upgrades_enabled : this.txFromJson<boolean>
  };

  /** @deprecated Use fromJson instead. */
  public readonly fromJSON = this.fromJson;

  /**
   * Parse a raw contract event (topics + data) into a typed {@link ContractEvent}.
   */
  parseEvent(topics: xdr.ScVal[] | string[], data: xdr.ScVal | string): ContractEvent | undefined {
    return this.spec.parseEvent(topics, data) as ContractEvent | undefined;
  }
  /**
   * Build a topics filter row for the "Funded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  fundedEventFilter(topicValues?: { id?: bigint }): string[] {
    return this.spec.eventTopicFilter("Funded", topicValues);
  }
  /**
   * Build a topics filter row for the "Created" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  createdEventFilter(topicValues?: { id?: bigint }): string[] {
    return this.spec.eventTopicFilter("Created", topicValues);
  }
  /**
   * Build a topics filter row for the "Expired" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  expiredEventFilter(topicValues?: { id?: bigint }): string[] {
    return this.spec.eventTopicFilter("Expired", topicValues);
  }
  /**
   * Build a topics filter row for the "Refunded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  refundedEventFilter(topicValues?: { id?: bigint }): string[] {
    return this.spec.eventTopicFilter("Refunded", topicValues);
  }
  /**
   * Build a topics filter row for the "Released" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  releasedEventFilter(topicValues?: { id?: bigint }): string[] {
    return this.spec.eventTopicFilter("Released", topicValues);
  }
  /**
   * Build a topics filter row for the "Upgraded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  upgradedEventFilter(): string[] {
    return this.spec.eventTopicFilter("Upgraded");
  }
  /**
   * Build a topics filter row for the "TokenAdded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  tokenAddedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TokenAdded", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminChangedEventFilter(topicValues?: { new_admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "TokenRemoved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  tokenRemovedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TokenRemoved", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminProposed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminProposedEventFilter(topicValues?: { new_admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminProposed", topicValues);
  }
  /**
   * Build a topics filter row for the "UpgradesLocked" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  upgradesLockedEventFilter(): string[] {
    return this.spec.eventTopicFilter("UpgradesLocked");
  }
}