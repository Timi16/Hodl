/** Escrow history from contract events (RPC getEvents). */
import { scValToNative } from "@stellar/stellar-sdk";
import { config } from "../config";
import { sc, server, withRetry } from "../stellar/rpc";
import type { EscrowAction, EscrowEvent, EscrowHistory } from "./types";

const ACTIONS: EscrowAction[] = ["created", "funded", "released", "refunded", "expired"];
const HODL = sc.symbol("hodl").toXDR("base64");

function parse(ev: Awaited<ReturnType<typeof server.getEvents>>["events"][number]): EscrowEvent | null {
  if (ev.topic.length < 3) return null;
  const action = scValToNative(ev.topic[1]) as string;
  if (!ACTIONS.includes(action as EscrowAction)) return null;
  const data = (scValToNative(ev.value) ?? {}) as Record<string, unknown>;
  return {
    id: ev.id,
    escrowId: Number(scValToNative(ev.topic[2])),
    action: action as EscrowAction,
    txHash: ev.txHash,
    ledger: ev.ledger,
    at: Math.floor(new Date(ev.ledgerClosedAt).getTime() / 1000),
    payer: data.payer as string | undefined,
    recipient: data.recipient as string | undefined,
    amount: data.amount !== undefined ? String(data.amount) : undefined,
    deadline: data.deadline !== undefined ? Number(data.deadline) : undefined,
  };
}

/** Clamps a start ledger into the RPC's retention window. */
async function retention(startLedger: number) {
  const health = await withRetry(() => server.getHealth());
  return {
    start: Math.max(startLedger, health.oldestLedger),
    truncated: startLedger < health.oldestLedger,
  };
}

async function collect(
  filters: Parameters<typeof server.getEvents>[0]["filters"],
  startLedger: number,
  max = 1000,
): Promise<EscrowEvent[]> {
  const out: EscrowEvent[] = [];
  let page = await withRetry(() => server.getEvents({ filters, startLedger, limit: 200 }));
  for (;;) {
    for (const ev of page.events) {
      const parsed = parse(ev);
      if (parsed) out.push(parsed);
    }
    if (page.events.length < 200 || out.length >= max) break;
    const cursor = page.cursor;
    page = await withRetry(() => server.getEvents({ filters, cursor, limit: 200 }));
  }
  return out;
}

/** Every receipt for one escrow, newest first. */
export async function getEscrowHistory(id: number, createdLedger: number): Promise<EscrowHistory> {
  const { start, truncated } = await retention(createdLedger);
  const events = await collect(
    [{ type: "contract", contractIds: [config.contractId], topics: [[HODL, "*", sc.u64(id).toXDR("base64")]] }],
    start,
  );
  return { events: events.reverse(), truncated };
}

/** Receipts across a set of escrows (a wallet's activity), newest first. */
export async function getActivity(ids: number[], fromLedger: number): Promise<EscrowHistory> {
  if (!ids.length) return { events: [], truncated: false };
  const { start, truncated } = await retention(fromLedger);
  const wanted = new Set(ids);
  const events = await collect(
    [{ type: "contract", contractIds: [config.contractId], topics: [[HODL, "*", "*"]] }],
    start,
    5000,
  );
  return { events: events.filter((e) => wanted.has(e.escrowId)).reverse(), truncated };
}
