import React from "react";
import { cn } from "@/lib/utils";

export function BeatCueOverlay({
  cues,
  currentBeat,
  visible,
}: {
  cues: (string | null)[];
  currentBeat: number;
  visible: boolean;
}) {
  const currentCue = cues?.[currentBeat - 1] ?? null;
  const shouldShow = visible && typeof currentCue === "string" && currentCue.length > 0;
  const fontSizeClass =
    typeof currentCue === "string"
      ? currentCue.length <= 2
        ? "text-[32px]"
        : currentCue.length <= 4
          ? "text-[29px]"
          : "text-[26px]"
      : "text-[29px]";

  return (
    <div
      className={cn(
        "pointer-events-none absolute left-1/2 top-[84px] z-30 -translate-x-1/2 select-none transition-all duration-150 ease-out",
        shouldShow ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
      )}
    >
      <div className="px-4 py-1.5">
        <span
          className={cn(
            "block whitespace-nowrap text-center font-semibold leading-none tracking-[0.02em] text-white",
            fontSizeClass
          )}
          style={{ textShadow: "0 2px 10px rgba(0, 0, 0, 0.55)" }}
        >
          {currentCue}
        </span>
      </div>
    </div>
  );
}
