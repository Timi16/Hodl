import type { Metadata } from "next";
import { DashboardScreen } from "./DashboardScreen";

export const metadata: Metadata = { title: "Overview" };

export default function DashboardPage() {
  return <DashboardScreen />;
}
