import { StrKey } from "@stellar/stellar-sdk";
import { toHodlError } from "./hodl/errors";

/** Public, read-only JSON API: CORS-open and CDN-cacheable for a few seconds. */
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function json(data: unknown, { status = 200, maxAge = 10 }: { status?: number; maxAge?: number } = {}) {
  return Response.json(data, {
    status,
    headers: {
      ...HEADERS,
      "Cache-Control":
        maxAge > 0 ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 3}` : "no-store",
    },
  });
}

export function apiError(status: number, code: string, message: string) {
  return json({ error: { code, message } }, { status, maxAge: 0 });
}

/** Maps a thrown error to a 502 (the chain or RPC failed) with plain words. */
export function upstreamError(err: unknown) {
  const e = toHodlError(err);
  return apiError(502, "upstream", `${e.title}: ${e.message}`);
}

export function preflight() {
  return new Response(null, { status: 204, headers: HEADERS });
}

/** Escrow ids are positive integers. */
export function parseId(raw: string): number | null {
  if (!/^\d{1,15}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

export const isAccount = (address: string) => StrKey.isValidEd25519PublicKey(address);
