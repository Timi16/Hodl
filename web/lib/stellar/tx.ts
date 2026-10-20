/**
 * Every write goes through here so the UX is identical for create, fund,
 * release, refund, claim and the USDC trustline:
 * simulating → signing (wallet) → submitting → confirming.
 */
import {
  Asset,
  BASE_FEE,
  Operation,
  TransactionBuilder,
  rpc,
  scValToNative,
  type Transaction,
  type xdr,
} from "@stellar/stellar-sdk";
import { config } from "../config";
import { HodlError, toHodlError } from "../hodl/errors";
import { chainError } from "./diagnostics";
import { hodl, server } from "./rpc";

export type TxStage = "simulating" | "signing" | "submitting" | "confirming";
export type SignFn = (txXdr: string) => Promise<string>;

export interface TxResult {
  hash: string;
  returnValue?: unknown;
}

interface Run {
  source: string;
  sign: SignFn;
  onStage?: (stage: TxStage) => void;
}

async function loadSource(source: string) {
  try {
    return await server.getAccount(source);
  } catch {
    throw new HodlError("Wallet not funded", "This wallet has no XLM yet. Fund it in Wallet setup first.");
  }
}

async function submit(prepared: Transaction, { sign, onStage }: Run): Promise<TxResult> {
  onStage?.("signing");
  let signedXdr: string;
  try {
    signedXdr = await sign(prepared.toXDR());
  } catch (err) {
    throw toHodlError(err instanceof Error ? err : new Error(`rejected: ${String(err)}`));
  }
  const signed = TransactionBuilder.fromXDR(signedXdr, config.networkPassphrase);

  onStage?.("submitting");
  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    const detail = chainError(sent.diagnosticEvents) ?? sent.errorResult?.result?.type ?? sent.status;
    throw toHodlError(new Error(String(detail)));
  }

  onStage?.("confirming");
  const res = await server.pollTransaction(sent.hash, { attempts: 45 });
  if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    return { hash: sent.hash, returnValue: res.returnValue ? scValToNative(res.returnValue) : undefined };
  }
  if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
    const err = toHodlError(new Error(chainError(res.diagnosticEventsXdr) ?? "Transaction failed on-chain"));
    throw Object.assign(err, { hash: sent.hash });
  }
  throw new HodlError("Still confirming", `Stellar hasn't confirmed ${sent.hash.slice(0, 8)}… yet. Check back shortly.`);
}

/** Calls a hodl-escrow function signed by `source`, the only party it needs. */
export async function invokeHodl(method: string, args: xdr.ScVal[], run: Run): Promise<TxResult> {
  run.onStage?.("simulating");
  const account = await loadSource(run.source);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(hodl.call(method, ...args))
    .setTimeout(180)
    .build();
  const sim = await server.simulateTransaction(tx);
  // A contract error (e.g. InvalidStatus) shows here, before the wallet opens.
  if (rpc.Api.isSimulationError(sim)) throw toHodlError(new Error(sim.error));
  return submit(rpc.assembleTransaction(tx, sim).build(), run);
}

/** Adds the USDC trustline so the wallet can hold USDC. */
export async function addUsdcTrustline(run: Run): Promise<TxResult> {
  run.onStage?.("simulating");
  const account = await loadSource(run.source);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(Operation.changeTrust({ asset: new Asset("USDC", config.usdcIssuer) }))
    .setTimeout(180)
    .build();
  return submit(tx, run);
}
