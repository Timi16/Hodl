import { json, preflight, upstreamError } from "@/lib/api";
import { cachedContractInfo } from "@/lib/hodl/cached";

/** GET /api/stats → the live contract: id, escrow count, version, upgrade lock, admin. */
export async function GET() {
  try {
    return json(await cachedContractInfo(), { maxAge: 30 });
  } catch (err) {
    return upstreamError(err);
  }
}

export const OPTIONS = preflight;
