import React from "react";
import { cn } from "@/lib/utils";

export function BeatCounterBadge({
  currentBeat,
  beatCount,
  visible = true,
  className,
}: {
  currentBeat: number;
  beatCount: number;
  visible?: boolean;
  className?: string;
}) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "pointer-events-none inline-flex select-none items-end gap-3 rounded-full border border-white/12 bg-[rgba(108,108,118,0.5)] px-5 py-3 text-white shadow-[0_14px_36px_rgba(0,0,0,0.18)] backdrop-blur-md",
        className
      )}
    >
      <div className="pb-1 text-[11px] font-medium uppercase tracking-[0.32em] text-white/68">
        Beat
      </div>
      <div className="text-[46px] font-semibold leading-none tracking-tight">
        {currentBeat}
      </div>
      <div className="pb-1 text-[20px] text-white/66">/ {beatCount}</div>
    </div>
  );
}
