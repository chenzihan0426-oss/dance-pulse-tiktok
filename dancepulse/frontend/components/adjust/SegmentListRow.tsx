import React from "react";
import { ChevronRight } from "lucide-react";
import type { Segment } from "@/lib/types";

export function SegmentListRow({
  index,
  segment,
  dirty,
  onClick,
}: {
  index: number;
  segment: Segment;
  dirty: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center gap-4 rounded-[24px] border px-4 py-4 text-left transition",
        dirty
          ? "border-brand-light bg-brand/12 shadow-[0_0_0_1px_rgba(192,132,252,0.28)]"
          : "border-white/8 bg-bg-surface hover:bg-white/[0.05]",
      ].join(" ")}
    >
      <div className="w-10 text-center font-mono text-[14px] font-semibold text-white/45">
        {String(index + 1).padStart(2, "0")}
      </div>

      <div className="overflow-hidden rounded-[16px] bg-black/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={segment.thumbnail}
          alt={`${segment.section_label} 预览图`}
          className="h-12 w-12 object-cover"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-[18px] font-semibold text-white">
            {segment.section_label}
          </div>
          {segment.is_still && (
            <span className="rounded-full bg-white/[0.08] px-2 py-1 text-[11px] text-white/60">
              静
            </span>
          )}
          {dirty && (
            <span className="rounded-full bg-state-warn/22 px-2 py-1 text-[11px] font-medium text-[#F7C25B]">
              已改
            </span>
          )}
        </div>

        <div className="mt-2 text-[14px] text-white/45">
          {segment.start.toFixed(2)} – {segment.end.toFixed(2)} · {segment.beat_count} 拍
        </div>
      </div>

      <ChevronRight className="h-5 w-5 text-white/35" />
    </button>
  );
}
