/**
 * HodL Testnet end-to-end proof. Runs every scenario against the deployed
 * contract and writes docs/TRANSACTIONS.md with a Stellar Expert link per step.
 *
 *   cd scripts && npm install
 *   node e2e.ts setup   # once: 3 keypairs in scripts/.env, Friendbot XLM, USDC trustlines
 *   # send ≥ 5 Testnet USDC to the payer from https://faucet.circle.com
 *   node e2e.ts         # scenarios A–F → docs/TRANSACTIONS.md
 *
 * Reads the contract id from deployments/testnet.env (written by deploy.sh).
 * scripts/.env holds Testnet secret keys and is never committed.
 * Environment variables override both files; E2E_KEYS_FILE and E2E_OUT
 * change where keys are kept and where the report is written.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";

// ------------------------------------------------------------------ config

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEYS_FILE = path.resolve(process.env.E2E_KEYS_FILE ?? path.join(ROOT, "scripts/.env"));
const DEPLOY_FILE = path.join(ROOT, "deployments/testnet.env");
const OUT_FILE = path.resolve(process.env.E2E_OUT ?? path.join(ROOT, "docs/TRANSACTIONS.md"));

if (existsSync(DEPLOY_FILE)) process.loadEnvFile(DEPLOY_FILE);
if (existsSync(KEYS_FILE)) process.loadEnvFile(KEYS_FILE);

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) fail(`Missing ${name}. Run scripts/deploy.sh first.`);
  return value;
};

const PASSPHRASE = env("NEXT_PUBLIC_NETWORK_PASSPHRASE", "Test SDF Network ; September 2015");
const RPC_URL = env("NEXT_PUBLIC_RPC_URL", "https://soroban-testnet.stellar.org");
const HORIZON_URL = env("NEXT_PUBLIC_HORIZON_URL", "https://horizon-testnet.stellar.org");
const EXPLORER = env("NEXT_PUBLIC_EXPLORER_URL", "https://stellar.expert/explorer/testnet");
const USDC_ISSUER = env("NEXT_PUBLIC_USDC_ISSUER", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const FRIENDBOT = "https://friendbot.stellar.org";

const USDC = new Asset("USDC", USDC_ISSUER);
/** 1 USDC per escrow (7 decimals). */
const AMOUNT = 10_000_000n;
/** A, B, C, D and E each lock one escrow; B and C come back. */
const USDC_NEEDED = 5;
const EXPIRY_SECONDS = 120;

const ERROR_NAMES = [
  "",
  "NotFound",
  "InvalidStatus",
  "InvalidAmount",
  "SameParty",
  "DeadlineInPast",
  "DeadlinePassed",
  "DeadlineNotReached",
  "TokenNotAllowed",
  "TitleTooLong",
  "TermsTooLong",
];

const server = new rpc.Server(RPC_URL);
const horizon = new Horizon.Server(HORIZON_URL);

type Role = "payer" | "recipient" | "stranger";
const ROLES: Role[] = ["payer", "recipient", "stranger"];
const keyVar = (role: Role) => `E2E_${role.toUpperCase()}_SECRET`;

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

// ------------------------------------------------------------------- setup

async function setup() {
  const lines: string[] = [];
  const keys = {} as Record<Role, Keypair>;
  for (const role of ROLES) {
    const secret = process.env[keyVar(role)];
    keys[role] = secret ? Keypair.fromSecret(secret) : Keypair.random();
    lines.push(`${keyVar(role)}=${keys[role].secret()}`);
  }
  writeFileSync(
    KEYS_FILE,
    `# Testnet-only keys for scripts/e2e.ts. Never commit this file.\n${lines.join("\n")}\n`,
  );

  for (const role of ROLES) {
    const kp = keys[role];
    if (!(await accountExists(kp.publicKey()))) {
      const res = await fetch(`${FRIENDBOT}?addr=${kp.publicKey()}`);
      if (!res.ok) fail(`Friendbot failed for ${role}: ${res.status}`);
      console.log(`✓ ${role} funded with Friendbot XLM`);
    }
    // The stranger never touches USDC, so it needs no trustline.
    if (role !== "stranger" && (await usdcBalance(kp.publicKey())) === null) {
      const account = await horizon.loadAccount(kp.publicKey());
      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
        .addOperation(Operation.changeTrust({ asset: USDC }))
        .setTimeout(60)
        .build();
      tx.sign(kp);
      await horizon.submitTransaction(tx);
      console.log(`✓ ${role} USDC trustline added`);
    }
    console.log(`  ${role.padEnd(9)} ${kp.publicKey()}`);
  }

  const balance = (await usdcBalance(keys.payer.publicKey())) ?? 0;
  console.log(`\nPayer USDC balance: ${balance}`);
  if (balance < USDC_NEEDED) {
    console.log(
      `\nNext: send ≥ ${USDC_NEEDED} Testnet USDC to the payer at https://faucet.circle.com\n` +
        `  (network: Stellar Testnet, address: ${keys.payer.publicKey()})\n` +
        `Then run: node e2e.ts`,
    );
  } else {
    console.log("\nReady. Run: node e2e.ts");
  }
}

async function accountExists(address: string): Promise<boolean> {
  try {
    await horizon.loadAccount(address);
    return true;
  } catch (e: any) {
    if (e?.response?.status === 404) return false;
    throw e;
  }
}

/** USDC balance as a number, or null if the account has no trustline. */
async function usdcBalance(address: string): Promise<number | null> {
  const account = await horizon.loadAccount(address);
  const line = account.balances.find(
    (b: any) => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER,
  );
  return line ? Number(line.balance) : null;
}

// ------------------------------------------------------------ chain helpers

const u64 = (n: bigint | number) => nativeToScVal(BigInt(n), { type: "u64" });
const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
const addr = (kp: Keypair) => nativeToScVal(kp.publicKey(), { type: "address" });
const str = (s: string) => nativeToScVal(s, { type: "string" });

const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-6)}`;
const txLink = (hash: string) => `[\`${short(hash)}\`](${EXPLORER}/tx/${hash})`;

function describeError(raw: string): string {
  const contract = raw.match(/Error\(Contract, #(\d+)\)/);
  if (contract) {
    const code = Number(contract[1]);
    return `Error #${code} ${ERROR_NAMES[code] ?? ""}`.trim();
  }
  const auth = raw.match(/Error\(Auth, (\w+)\)/);
  if (auth) return `Auth error (${auth[1]})`;
  return raw.split("\n")[0].slice(0, 120);
}

/** SCError type / code numbers that matter here (stellar-xdr Stellar-contract.x). */
const SC_ERROR_TYPES: Record<number, string> = { 9: "Auth" };
const SC_ERROR_CODES: Record<number, string> = { 6: "InvalidAction" };

/**
 * The error the network recorded for a failed invocation, read from the
 * `host_fn_failed` diagnostic event. Same wording as `describeError`.
 */
function chainError(events: xdr.DiagnosticEvent[] | undefined): string | undefined {
  for (const event of events ?? []) {
    const body = (event as any).event?.body;
    const topics: xdr.ScVal[] = (body?.value ?? body)?.topics ?? [];
    if (topics.length < 2) continue;
    try {
      if (scValToNative(topics[0]) !== "host_fn_failed") continue;
    } catch {
      continue;
    }
    const err = ((topics[1] as any).value ?? topics[1])?.toXdrObject?.() ?? {};
    if (err.contractCode !== undefined) {
      return `Error #${err.contractCode} ${ERROR_NAMES[err.contractCode] ?? ""}`.trim();
    }
    const type = SC_ERROR_TYPES[err.type] ?? `type ${err.type}`;
    return type === "Auth"
      ? `Auth error (${SC_ERROR_CODES[err.code] ?? err.code})`
      : `Host error (${type}, code ${err.code})`;
  }
  return undefined;
}

async function baseTx(source: Keypair, op: xdr.Operation, fee = BASE_FEE): Promise<Transaction> {
  const account = await server.getAccount(source.publicKey());
  return new TransactionBuilder(account, { fee, networkPassphrase: PASSPHRASE })
    .addOperation(op)
    .setTimeout(120)
    .build();
}

/** What a successful call needed, so a duplicate can be replayed on-chain. */
type Replay = { data: xdr.SorobanTransactionData; auth: xdr.SorobanAuthorizationEntry[] };

type Sent = { status: "SUCCESS" | "FAILED"; hash: string; value?: unknown; detail: string; error?: string };

async function send(tx: Transaction, signer: Keypair): Promise<Sent> {
  tx.sign(signer);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    const code = sent.errorResult ? failureCode(sent.errorResult) : sent.status;
    return { status: "FAILED", hash: sent.hash, detail: `not accepted: ${code}` };
  }
  const res = await server.pollTransaction(sent.hash, { attempts: 60 });
  if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    const value = res.returnValue ? scValToNative(res.returnValue) : undefined;
    return { status: "SUCCESS", hash: sent.hash, value, detail: "SUCCESS" };
  }
  if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
    return {
      status: "FAILED",
      hash: sent.hash,
      detail: failureCode(res.resultXdr),
      error: chainError(res.diagnosticEventsXdr),
    };
  }
  return { status: "FAILED", hash: sent.hash, detail: `not confirmed: ${res.status}` };
}

/** Most specific result code: the invoke result (e.g. invokeHostFunctionTrapped) or the tx code. */
function failureCode(result: xdr.TransactionResult): string {
  const tx = result.result as { type: string; results?: Array<{ type: string; tr?: { value?: { type?: string } } }> };
  const op = tx.results?.[0];
  return op?.type === "opInner" ? (op.tr?.value?.type ?? tx.type) : tx.type;
}

const hodl = new Contract(env("NEXT_PUBLIC_HODL_CONTRACT_ID"));

type Invoked =
  | { ok: false; error: string; sent?: undefined }
  | { ok: boolean; sent: Sent; replay: Replay; error?: undefined };

/** Simulate, assemble, sign as `signer` (the source and only required auth), send. */
async function invoke(signer: Keypair, method: string, args: xdr.ScVal[]): Promise<Invoked> {
  const tx = await baseTx(signer, hodl.call(method, ...args));
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    return { ok: false, error: describeError(sim.error) };
  }
  const replay: Replay = { data: sim.transactionData.build(), auth: sim.result?.auth ?? [] };
  const sent = await send(rpc.assembleTransaction(tx, sim).build(), signer);
  return { ok: sent.status === "SUCCESS", sent, replay };
}

/** Read-only call through simulation: no signature, no fee. */
async function read(method: string, args: xdr.ScVal[], source: Keypair): Promise<any> {
  const tx = await baseTx(source, hodl.call(method, ...args));
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(describeError(sim.error));
  return scValToNative(sim.result!.retval);
}

const statusName = (s: unknown) => (Array.isArray(s) ? String(s[0]) : String(s));

async function ledgerTime(): Promise<number> {
  return Number((await server.getLatestLedger()).closeTime);
}

// ----------------------------------------------------------------- report

type Row = { scenario: string; step: string; signer: string; result: string; hash?: string; pass: boolean };
const rows: Row[] = [];
const SCENARIOS: Record<string, string> = {
  A: "A. Happy release",
  B: "B. Recipient refund",
  C: "C. Expiry",
  D: "D. Two-step create",
  E: "E. Unauthorized",
  F: "F. Duplicates",
};

function record(row: Row) {
  rows.push(row);
  const mark = row.pass ? "✓" : "✖";
  console.log(`${mark} ${row.scenario}  ${row.step.padEnd(30)} ${row.signer.padEnd(9)} ${row.result}${row.hash ? `  ${row.hash}` : ""}`);
}

function writeReport(keys: Record<Role, Keypair>, startedAt: Date) {
  const contractId = hodl.contractId();
  const out: string[] = [
    "# HodL: Testnet transactions",
    "",
    `Generated by \`scripts/e2e.ts\` on ${startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC against`,
    `[\`${contractId}\`](${EXPLORER}/contract/${contractId}) on Stellar Testnet.`,
    "",
    "Scenarios A to D succeed. Scenarios E and F are rejected by the contract. Each rejection is",
    "first shown by simulation, then submitted on-chain anyway, so the failed transaction is",
    "verifiable too; the error quoted is the one the network recorded. Every hash opens on",
    "Stellar Expert.",
    "",
    "- **Auth error (InvalidAction)**: the call lacked the signature of the party the contract",
    "  requires (`require_auth`), so it stopped before any contract logic ran.",
    "- **Error #2 InvalidStatus**: the escrow was already closed or funded; nothing moved.",
    "- **Error #7 DeadlineNotReached**: the payer tried to reclaim before the deadline.",
    "",
    "| Account | Address |",
    "|---|---|",
    ...ROLES.map((r) => `| ${r} | [\`${keys[r].publicKey()}\`](${EXPLORER}/account/${keys[r].publicKey()}) |`),
    "",
    `Each escrow locks ${Number(AMOUNT) / 1e7} USDC.`,
  ];
  for (const [key, title] of Object.entries(SCENARIOS)) {
    const list = rows.filter((r) => r.scenario === key);
    if (!list.length) continue;
    out.push("", `## ${title}`, "", "| Step | Signer | Result | Transaction |", "|---|---|---|---|");
    for (const r of list) {
      out.push(`| ${r.step} | ${r.signer} | ${r.pass ? "" : "❌ "}${r.result} | ${r.hash ? txLink(r.hash) : "n/a"} |`);
    }
  }
  const failed = rows.filter((r) => !r.pass).length;
  out.push(
    "",
    "## Summary",
    "",
    failed
      ? `**${failed} step(s) did not behave as expected.** See the ❌ rows above.`
      : `All ${rows.length} steps behaved as expected.`,
    "",
  );
  writeFileSync(OUT_FILE, out.join("\n"));
  console.log(`\nWrote ${OUT_FILE}`);
}

// -------------------------------------------------------------- scenarios

const who = (keys: Record<Role, Keypair>, kp: Keypair) =>
  ROLES.find((r) => keys[r].publicKey() === kp.publicKey())!;

async function run() {
  const keys = {} as Record<Role, Keypair>;
  for (const role of ROLES) {
    const secret = process.env[keyVar(role)];
    if (!secret) fail(`Missing ${keyVar(role)}. Run: node e2e.ts setup`);
    keys[role] = Keypair.fromSecret(secret);
  }
  const { payer, recipient, stranger } = keys;

  const balance = await usdcBalance(payer.publicKey());
  if (balance === null || balance < USDC_NEEDED) {
    fail(
      `Payer needs ≥ ${USDC_NEEDED} Testnet USDC (has ${balance ?? "no trustline"}).\n` +
        `  Faucet: https://faucet.circle.com  →  ${payer.publicKey()}`,
    );
  }
  if ((await usdcBalance(recipient.publicKey())) === null) fail("Recipient has no USDC trustline. Run: node e2e.ts setup");

  const startedAt = new Date();
  const replays = new Map<string, Replay>();
  let ok = true;

  /** A step that must succeed. Returns the call's return value. */
  async function expectSuccess(scenario: string, step: string, signer: Keypair, method: string, args: xdr.ScVal[], id?: bigint) {
    const res = await invoke(signer, method, args);
    if (!res.ok || !res.sent) {
      const result = res.error ?? res.sent?.detail ?? "unknown error";
      record({ scenario, step, signer: who(keys, signer), result, hash: res.sent?.hash, pass: false });
      writeReport(keys, startedAt);
      fail(`${scenario} ${step} failed: ${result}`);
    }
    const escrowId = id ?? (res.sent.value as bigint);
    replays.set(`${escrowId}:${method}`, res.replay!);
    const view = await read("get_escrow", [u64(escrowId)], payer);
    const status = statusName(view.escrow.status);
    record({ scenario, step, signer: who(keys, signer), result: `✅ ${status}`, hash: res.sent.hash, pass: true });
    return escrowId;
  }

  /**
   * A call the contract must reject. Shows the reason by simulation, then
   * submits it on-chain to get a verifiable failed transaction:
   * - "unauthorized": the attacker submits without the real party's signature.
   * - "duplicate": replays the original call's footprint and auth.
   * - "simulated": no earlier call to replay, so the simulation is the proof.
   */
  async function expectRejection(scenario: string, step: string, signer: Keypair, method: string, id: bigint, kind: "unauthorized" | "duplicate" | "simulated") {
    const args = [u64(id)];
    const tx = await baseTx(signer, hodl.call(method, ...args));
    // Enforce mode checks signatures like the network does; record mode would
    // happily list the missing signature as "required" instead of failing.
    const sim = await server.simulateTransaction(tx, undefined, kind === "unauthorized" ? "enforce" : undefined);
    if (!rpc.Api.isSimulationError(sim)) {
      ok = false;
      record({ scenario, step, signer: who(keys, signer), result: "Simulation succeeded; expected a rejection", pass: false });
      return;
    }
    const reason = describeError(sim.error);
    if (kind === "simulated") {
      record({ scenario, step, signer: who(keys, signer), result: `⛔ ${reason} (simulation)`, pass: true });
      return;
    }

    let proof: Transaction;
    if (kind === "unauthorized") {
      const recording = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(recording)) {
        record({ scenario, step, signer: who(keys, signer), result: `⛔ ${reason}`, pass: true });
        return;
      }
      recording.result!.auth = []; // the signature the attacker cannot produce
      proof = rpc.assembleTransaction(tx, recording).build();
    } else {
      const replay = replays.get(`${id}:${method}`)!;
      const fee = (BigInt(BASE_FEE) + replay.data.resourceFee).toString();
      const op = Operation.invokeContractFunction({
        contract: hodl.contractId(),
        function: method,
        args,
        auth: replay.auth,
      });
      const account = await server.getAccount(signer.publicKey());
      proof = new TransactionBuilder(account, { fee, networkPassphrase: PASSPHRASE })
        .addOperation(op)
        .setSorobanData(replay.data)
        .setTimeout(120)
        .build();
    }
    const sent = await send(proof, signer);
    // Pass only if the network rejected it, and for the same reason simulation gave.
    const pass = sent.status === "FAILED" && (sent.error === undefined || sent.error === reason);
    if (!pass) ok = false;
    const onChain = sent.error ? `FAILED on-chain with ${sent.error}` : `FAILED on-chain (${sent.detail})`;
    record({
      scenario,
      step,
      signer: who(keys, signer),
      result:
        sent.status === "SUCCESS"
          ? "Accepted on-chain; expected a rejection"
          : `⛔ ${reason} · ${pass ? onChain : `but ${onChain}`}`,
      hash: sent.hash,
      pass,
    });
  }

  const now = await ledgerTime();
  const dayLater = now + 86_400;
  const createArgs = (title: string, deadline: number) => [
    addr(payer),
    addr(recipient),
    nativeToScVal(env("NEXT_PUBLIC_USDC_SAC_ID"), { type: "address" }),
    i128(AMOUNT),
    u64(deadline),
    str(title),
    str(`HodL e2e scenario: ${title}`),
  ];

  console.log(`Contract ${hodl.contractId()}\n`);

  // A. Happy release
  const a = await expectSuccess("A", "create_and_fund", payer, "create_and_fund", createArgs("Happy release", dayLater));
  await expectSuccess("A", `release #${a}`, payer, "release", [u64(a)], a);

  // B. Recipient refund
  const b = await expectSuccess("B", "create_and_fund", payer, "create_and_fund", createArgs("Recipient refund", dayLater));
  await expectSuccess("B", `refund #${b}`, recipient, "refund", [u64(b)], b);

  // C. Expiry (claimed after D–F so the wait overlaps with other work)
  const cDeadline = (await ledgerTime()) + EXPIRY_SECONDS;
  const c = await expectSuccess("C", `create_and_fund (${EXPIRY_SECONDS}s deadline)`, payer, "create_and_fund", createArgs("Expiry", cDeadline));
  await expectRejection("C", `claim_expired #${c} early`, payer, "claim_expired", c, "simulated");

  // D. Two-step create
  const d = await expectSuccess("D", "create", payer, "create", createArgs("Two-step create", dayLater));
  await expectSuccess("D", `fund #${d}`, payer, "fund", [u64(d)], d);
  await expectSuccess("D", `release #${d}`, payer, "release", [u64(d)], d);

  // E. Unauthorized: a funded escrow, attacked three ways, then released.
  const e = await expectSuccess("E", "create_and_fund", payer, "create_and_fund", createArgs("Unauthorized", dayLater));
  await expectRejection("E", `release #${e} by stranger`, stranger, "release", e, "unauthorized");
  await expectRejection("E", `release #${e} by recipient`, recipient, "release", e, "unauthorized");
  await expectRejection("E", `refund #${e} by payer`, payer, "refund", e, "unauthorized");
  const stillFunded = statusName((await read("get_escrow", [u64(e)], payer)).escrow.status);
  record({ scenario: "E", step: `get_escrow #${e}`, signer: "anyone", result: `Still ${stillFunded}, funds untouched`, pass: stillFunded === "Funded" });
  await expectSuccess("E", `release #${e} by payer`, payer, "release", [u64(e)], e);

  // F. Duplicates
  await expectRejection("F", `release #${a} again`, payer, "release", a, "duplicate");
  await expectRejection("F", `refund #${b} again`, recipient, "refund", b, "duplicate");
  await expectRejection("F", `fund #${d} again`, payer, "fund", d, "duplicate");

  // C, continued.
  process.stdout.write(`… waiting for escrow #${c}'s deadline`);
  while ((await ledgerTime()) < cDeadline) {
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 5_000));
  }
  console.log();
  await expectSuccess("C", `claim_expired #${c}`, payer, "claim_expired", [u64(c)], c);

  writeReport(keys, startedAt);
  if (!ok || rows.some((r) => !r.pass)) process.exit(1);
}

// -------------------------------------------------------------------- main

const command = process.argv[2];
if (command === "setup") await setup();
else if (!command) await run();
else fail(`Unknown command "${command}". Use: node e2e.ts [setup]`);
