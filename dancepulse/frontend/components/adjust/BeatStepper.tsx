import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function BeatStepper({
  label,
  value,
  canStepMinus,
  canStepPlus,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  canStepMinus: boolean;
  canStepPlus: boolean;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="rounded-[24px] bg-bg-root px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[15px] text-white/45">{label}</div>
        <div className="font-mono text-[18px] font-semibold text-white">{value}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={!canStepMinus}
          onClick={onMinus}
          className="flex items-center justify-center gap-2 rounded-[18px] bg-white/[0.06] px-4 py-4 text-[15px] text-white transition disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronLeft className="h-4 w-4" />
          -1 拍
        </button>
        <button
          type="button"
          disabled={!canStepPlus}
          onClick={onPlus}
          className="flex items-center justify-center gap-2 rounded-[18px] bg-white/[0.06] px-4 py-4 text-[15px] text-white transition disabled:cursor-not-allowed disabled:opacity-35"
        >
          +1 拍
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
