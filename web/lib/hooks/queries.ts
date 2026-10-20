"use client";
import { useQuery } from "@tanstack/react-query";
import { getActivity, getEscrowHistory } from "../hodl/events";
import { getContractInfo, getEscrow, getEscrows, getUserEscrowIds } from "../hodl/reads";
import type { Escrow } from "../hodl/types";
import { getReadiness } from "../stellar/horizon";

export const keys = {
  escrow: (id: number) => ["escrow", id] as const,
  history: (id: number) => ["history", id] as const,
  user: (address: string) => ["user", address] as const,
  activity: (address: string) => ["activity", address] as const,
  readiness: (address: string) => ["readiness", address] as const,
  info: ["info"] as const,
};

/** One escrow, live: refetched every 10 s on the detail page. */
export function useEscrow(id: number | null) {
  return useQuery({
    queryKey: keys.escrow(id ?? 0),
    queryFn: () => getEscrow(id!),
    enabled: id !== null,
    refetchInterval: 10_000,
  });
}

export function useEscrowHistory(escrow: Escrow | null | undefined) {
  return useQuery({
    queryKey: keys.history(escrow?.id ?? 0),
    queryFn: () => getEscrowHistory(escrow!.id, escrow!.createdLedger),
    enabled: !!escrow,
    refetchInterval: 10_000,
  });
}

export interface UserEscrows {
  paying: number[];
  receiving: number[];
  /** Newest first. */
  escrows: Escrow[];
}

/** Every escrow the address pays or receives. */
export function useUserEscrows(address: string | null) {
  return useQuery({
    queryKey: keys.user(address ?? ""),
    enabled: !!address,
    refetchInterval: 20_000,
    queryFn: async (): Promise<UserEscrows> => {
      const ids = await getUserEscrowIds(address!);
      const all = [...new Set([...ids.paying, ...ids.receiving])];
      const escrows = all.length ? await getEscrows(all) : [];
      return { ...ids, escrows: escrows.sort((a, b) => b.id - a.id) };
    },
  });
}

/** Every receipt across a wallet's escrows. */
export function useActivity(address: string | null, escrows: Escrow[] | undefined) {
  return useQuery({
    queryKey: keys.activity(address ?? ""),
    enabled: !!address && !!escrows,
    queryFn: () =>
      getActivity(
        escrows!.map((e) => e.id),
        Math.min(...escrows!.map((e) => e.createdLedger), Number.MAX_SAFE_INTEGER),
      ),
  });
}

export function useReadiness(address: string | null) {
  return useQuery({
    queryKey: keys.readiness(address ?? ""),
    queryFn: () => getReadiness(address!),
    enabled: !!address,
    refetchInterval: 15_000,
  });
}

export function useContractInfo() {
  return useQuery({ queryKey: keys.info, queryFn: getContractInfo, staleTime: 60_000 });
}
