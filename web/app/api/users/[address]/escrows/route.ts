import { apiError, isAccount, json, preflight, upstreamError } from "@/lib/api";
import { cachedActivity, cachedEscrows, cachedUserIds } from "@/lib/hodl/cached";

/**
 * GET /api/users/:address/escrows → the ids this address pays and receives.
 *   ?expand=1   also returns every escrow
 *   ?activity=1 also returns every receipt across them, newest first
 */
export async function GET(req: Request, ctx: RouteContext<"/api/users/[address]/escrows">) {
  const { address } = await ctx.params;
  if (!isAccount(address)) return apiError(400, "bad_address", "Expected a Stellar account (G…).");
  const params = new URL(req.url).searchParams;
  try {
    const ids = await cachedUserIds(address);
    const all = [...new Set([...ids.paying, ...ids.receiving])].sort((a, b) => a - b);
    const escrows = params.get("expand") || params.get("activity") ? await cachedEscrows(all) : undefined;
    const activity =
      params.get("activity") && escrows?.length
        ? await cachedActivity(all, Math.min(...escrows.map((e) => e.createdLedger)))
        : undefined;
    return json({ address, ...ids, escrows, activity });
  } catch (err) {
    return upstreamError(err);
  }
}

export const OPTIONS = preflight;
