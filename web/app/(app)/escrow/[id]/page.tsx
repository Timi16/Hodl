import type { Metadata } from "next";
import { Suspense } from "react";
import { EscrowScreen, EscrowSkeleton } from "./EscrowScreen";

// No chain read here: it would block every page load on RPC. Link previews get
// the escrow's title, amount and status from opengraph-image.tsx instead.
export async function generateMetadata({ params }: PageProps<"/escrow/[id]">): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Escrow #${id}`,
    description: "A HodL escrow on Stellar Testnet. Open it to see who can release or refund it.",
  };
}

export default function EscrowPage({ params }: PageProps<"/escrow/[id]">) {
  // The id is runtime data: read it inside the boundary.
  return (
    <Suspense fallback={<EscrowSkeleton />}>
      <EscrowScreen params={params} />
    </Suspense>
  );
}
