import type { Metadata } from "next";
import { NewEscrowScreen } from "./NewEscrowScreen";

export const metadata: Metadata = { title: "Start an escrow" };

export default function NewEscrowPage() {
  return <NewEscrowScreen />;
}
