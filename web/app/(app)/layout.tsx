import { AppHeader } from "@/components/layout/AppHeader";
import { Glow } from "@/components/ui/primitives";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <Glow drift className="-top-[140px] right-[-80px] h-[520px] w-[560px]" color="rgb(91 240 176 / 0.09)" />
      <AppHeader />
      {children}
    </div>
  );
}
