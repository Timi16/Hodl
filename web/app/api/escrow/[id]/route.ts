import { apiError, json, parseId, preflight, upstreamError } from "@/lib/api";
import { cachedEscrow } from "@/lib/hodl/cached";
import { phaseOf } from "@/lib/hodl/phase";

/** GET /api/escrow/:id → one escrow, straight from the contract. */
export async function GET(_req: Request, ctx: RouteContext<"/api/escrow/[id]">) {
  const id = parseId((await ctx.params).id);
  if (id === null) return apiError(400, "bad_id", "Escrow ids are positive integers.");
  try {
    const escrow = await cachedEscrow(id);
    if (!escrow) return apiError(404, "not_found", `Escrow #${id} doesn't exist.`);
    return json({ escrow, phase: phaseOf(escrow) });
  } catch (err) {
    return upstreamError(err);
  }
}

export const OPTIONS = preflight;
