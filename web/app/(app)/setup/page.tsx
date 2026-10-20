import type { Metadata } from "next";
import { SetupScreen } from "./SetupScreen";

export const metadata: Metadata = { title: "Wallet setup" };

export default function SetupPage() {
  return <SetupScreen />;
}
