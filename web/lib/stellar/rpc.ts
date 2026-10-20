import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  type xdr,
} from "@stellar/stellar-sdk";
import { config } from "../config";

export const server = new rpc.Server(config.rpcUrl);
export const hodl = new Contract(config.contractId);

/** Any well-formed address works as the source of a read-only simulation. */
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export const sc = {
  u64: (n: number | bigint) => nativeToScVal(BigInt(n), { type: "u64" }),
  i128: (n: bigint) => nativeToScVal(n, { type: "i128" }),
  address: (a: string) => nativeToScVal(a, { type: "address" }),
  string: (s: string) => nativeToScVal(s, { type: "string" }),
  symbol: (s: string) => nativeToScVal(s, { type: "symbol" }),
  u64Vec: (ns: number[]) => nativeToScVal(ns.map(BigInt), { type: "u64" }),
};

export class SimulationError extends Error {}

/** Public RPC occasionally returns 502/503; retry those, never contract errors. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const transient = err instanceof SimulationError ? false : status === undefined || status >= 500;
      if (!transient || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
}

/** Calls a contract function through simulation: no signature, no fee. */
export async function view<T = unknown>(method: string, args: xdr.ScVal[] = []): Promise<T> {
  const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(hodl.call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await withRetry(() => server.simulateTransaction(tx));
  if (rpc.Api.isSimulationError(sim)) throw new SimulationError(sim.error);
  if (!sim.result) throw new SimulationError(`${method} returned no result`);
  return scValToNative(sim.result.retval) as T;
}
