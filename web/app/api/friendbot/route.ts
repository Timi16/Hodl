import { apiError, isAccount, json, preflight } from "@/lib/api";
import { config } from "@/lib/config";

/**
 * POST /api/friendbot { address } → funds a Testnet account with XLM.
 * Testnet only; the app's Setup page calls this so it never depends on
 * Friendbot's CORS settings. Holds no keys.
 */
export async function POST(req: Request) {
  if (config.network !== "testnet") return apiError(400, "not_testnet", "Friendbot only exists on Testnet.");
  const body = (await req.json().catch(() => null)) as { address?: unknown } | null;
  const address = typeof body?.address === "string" ? body.address : "";
  if (!isAccount(address)) return apiError(400, "bad_address", "Expected a Stellar account (G…).");

  const res = await fetch(`${config.friendbotUrl}?addr=${encodeURIComponent(address)}`, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { hash?: string; detail?: string };
  if (res.ok) return json({ funded: true, hash: data.hash ?? null }, { maxAge: 0 });
  // Friendbot answers 400 when the account already exists: that's "ready", not a failure.
  if (/already|createAccountAlreadyExist/i.test(JSON.stringify(data))) {
    return json({ funded: true, alreadyFunded: true, hash: null }, { maxAge: 0 });
  }
  return apiError(502, "friendbot_failed", data.detail ?? `Friendbot responded ${res.status}`);
}

export const OPTIONS = preflight;
