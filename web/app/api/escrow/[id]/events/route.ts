import { apiError, json, parseId, preflight, upstreamError } from "@/lib/api";
import { cachedEscrow, cachedHistory } from "@/lib/hodl/cached";

/**
 * GET /api/escrow/:id/events → the escrow's receipts (contract events with
 * tx hashes), newest first. `truncated` is true when the escrow is older
 * than the RPC event window; the escrow's stored timestamps still apply.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/escrow/[id]/events">) {
  const id = parseId((await ctx.params).id);
  if (id === null) return apiError(400, "bad_id", "Escrow ids are positive integers.");
  try {
    const escrow = await cachedEscrow(id);
    if (!escrow) return apiError(404, "not_found", `Escrow #${id} doesn't exist.`);
    return json(await cachedHistory(id, escrow.createdLedger));
  } catch (err) {
    return upstreamError(err);
  }
}

export const OPTIONS = preflight;
