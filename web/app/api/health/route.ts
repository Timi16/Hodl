import { connection } from "next/server";
import { json } from "@/lib/api";
import { config } from "@/lib/config";
import { server } from "@/lib/stellar/rpc";

/** GET /api/health → whether Soroban RPC and Horizon are reachable right now. Never cached. */
export async function GET() {
  await connection();
  const started = performance.now();
  const [rpcHealth, horizon] = await Promise.allSettled([
    server.getHealth(),
    fetch(config.horizonUrl, { cache: "no-store" }).then((r) => r.ok),
  ]);
  const rpcOk = rpcHealth.status === "fulfilled";
  const horizonOk = horizon.status === "fulfilled" && horizon.value;
  return json(
    {
      ok: rpcOk && horizonOk,
      network: config.network,
      contractId: config.contractId,
      rpc: rpcOk
        ? { ok: true, latestLedger: rpcHealth.value.latestLedger, oldestLedger: rpcHealth.value.oldestLedger }
        : { ok: false },
      horizon: { ok: horizonOk },
      tookMs: Math.round(performance.now() - started),
    },
    { status: rpcOk && horizonOk ? 200 : 503, maxAge: 0 },
  );
}
