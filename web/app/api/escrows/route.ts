import { apiError, json, parseId, preflight, upstreamError } from "@/lib/api";
import { cachedEscrows } from "@/lib/hodl/cached";

const MAX_IDS = 100;

/** GET /api/escrows?ids=1,2,3 → a batch read in the order given; unknown ids are skipped. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("ids") ?? "";
  const parts = raw.split(",").filter(Boolean);
  if (!parts.length) return apiError(400, "missing_ids", "Pass ?ids=1,2,3");
  if (parts.length > MAX_IDS) return apiError(400, "too_many_ids", `At most ${MAX_IDS} ids per request.`);
  const ids = parts.map(parseId);
  if (ids.some((id) => id === null)) return apiError(400, "bad_id", "Escrow ids are positive integers.");
  try {
    return json({ escrows: await cachedEscrows([...new Set(ids as number[])]) });
  } catch (err) {
    return upstreamError(err);
  }
}

export const OPTIONS = preflight;
