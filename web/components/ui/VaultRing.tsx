import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The vault ring: slow-turning rings mean "held". They take the status colour.
 * Size it with the className (e.g. "w-[min(320px,100%)]"); it stays square.
 */
export function VaultRing({
  rgb = "91 240 176",
  dot = "#5BF0B0",
  inner = true,
  disc = false,
  className,
  children,
  label,
}: {
  rgb?: string;
  dot?: string;
  /** Second, counter-rotating ring with an orbiting dot. */
  inner?: boolean;
  /** Dark disc behind the centre content. */
  disc?: boolean;
  className?: string;
  children?: ReactNode;
  label?: string;
}) {
  return (
    <div
      className={cn("relative aspect-square", className)}
      {...(label ? { role: "img", "aria-label": label } : {})}
    >
      <div
        aria-hidden="true"
        className="spin absolute inset-0 rounded-full border border-dashed transition-colors duration-700"
        style={{ borderColor: `rgb(${rgb} / 0.35)` }}
      />
      {inner && (
        <div aria-hidden="true" className="spinr absolute inset-[12%] rounded-full border border-white/[0.07]">
          <span
            className="absolute -top-[5px] left-1/2 -ml-[5px] size-2.5 rounded-full transition-colors duration-700"
            style={{ background: dot, boxShadow: `0 0 14px ${dot}` }}
          />
        </div>
      )}
      {disc && (
        <div aria-hidden="true" className="absolute inset-[24%] rounded-full border border-white/[0.06] bg-night/60" />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">{children}</div>
    </div>
  );
}
