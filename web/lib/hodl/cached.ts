/**
 * Server-side cached reads for the API routes and share cards. Short
 * lifetimes: the chain is the source of truth and the app itself always
 * reads live. Cache keys are the arguments.
 */
import { cacheLife, cacheTag } from "next/cache";
import { getActivity, getEscrowHistory } from "./events";
import { getContractInfo, getEscrow, getEscrows, getUserEscrowIds } from "./reads";

const LIVE = { stale: 10, revalidate: 10, expire: 60 };

export async function cachedEscrow(id: number) {
  "use cache";
  cacheLife(LIVE);
  cacheTag(`escrow-${id}`);
  return getEscrow(id);
}

export async function cachedEscrows(ids: number[]) {
  "use cache";
  cacheLife(LIVE);
  return getEscrows(ids);
}

export async function cachedUserIds(address: string) {
  "use cache";
  cacheLife(LIVE);
  cacheTag(`user-${address}`);
  return getUserEscrowIds(address);
}

export async function cachedHistory(id: number, createdLedger: number) {
  "use cache";
  cacheLife(LIVE);
  cacheTag(`escrow-${id}`);
  return getEscrowHistory(id, createdLedger);
}

export async function cachedActivity(ids: number[], fromLedger: number) {
  "use cache";
  cacheLife(LIVE);
  return getActivity(ids, fromLedger);
}

export async function cachedContractInfo() {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  return getContractInfo();
}
