import { ImageResponse } from "next/og";
import { formatAmount, shortAddress } from "@/lib/format";
import { cachedEscrow } from "@/lib/hodl/cached";
import { LOOK, phaseOf } from "@/lib/hodl/phase";
import { loadSerif } from "@/lib/og-fonts";

export const alt = "A HodL escrow on Stellar Testnet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card shown when an escrow link is pasted into WhatsApp, X or Slack. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escrow = /^\d{1,15}$/.test(id) ? await cachedEscrow(Number(id)).catch(() => null) : null;
  const serif = await loadSerif();
  const look = escrow ? LOOK[phaseOf(escrow)] : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#060807",
          color: "#EDEFEA",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -120,
            top: -120,
            width: 620,
            height: 620,
            borderRadius: 620,
            background: `radial-gradient(circle, rgba(${(look?.rgb ?? "91 240 176").replaceAll(" ", ",")},0.28), rgba(6,8,7,0) 70%)`,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="52" height="52" viewBox="0 0 36 36">
            <rect width="36" height="36" rx="11" fill="#5BF0B0" />
            <rect x="8.5" y="8.5" width="5" height="19" rx="2.5" fill="#060807" />
            <rect x="22.5" y="8.5" width="5" height="19" rx="2.5" fill="#060807" />
            <path d="M14.8 17.2v-2.1a3.2 3.2 0 0 1 6.4 0v2.1" fill="none" stroke="#060807" strokeWidth="2.3" strokeLinecap="round" />
            <rect x="13.5" y="17" width="9" height="7.5" rx="2.2" fill="#060807" />
            <circle cx="18" cy="20.4" r="1.25" fill="#5BF0B0" />
          </svg>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>HodL</span>
          {look && (
            <span
              style={{
                marginLeft: 24,
                padding: "8px 20px",
                borderRadius: 999,
                fontSize: 24,
                color: look.fg,
                border: `2px solid ${look.fg}`,
              }}
            >
              {look.badge}
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 30, color: "#7A827B", letterSpacing: 4 }}>{escrow ? `ESCROW #${escrow.id}` : "ESCROW"}</span>
          <span style={{ fontFamily: serif ? "Instrument Serif" : "serif", fontSize: 76, lineHeight: 1.05, maxWidth: 980 }}>
            {escrow ? escrow.title || `Escrow #${escrow.id}` : "Pay strangers without trusting them."}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontFamily: serif ? "Instrument Serif" : "serif", fontSize: 120, lineHeight: 1, color: look?.fg ?? "#EDEFEA" }}>
              {escrow ? formatAmount(escrow.amount) : "USDC"}
            </span>
            {escrow && <span style={{ fontSize: 34, color: "#9CA39D" }}>USDC</span>}
          </div>
          {escrow && (
            <span style={{ fontSize: 28, color: "#9CA39D" }}>
              {shortAddress(escrow.payer)} → {shortAddress(escrow.recipient)}
            </span>
          )}
        </div>
      </div>
    ),
    { ...size, fonts: serif ? [{ name: "Instrument Serif", data: serif, weight: 400, style: "normal" }] : [] },
  );
}
