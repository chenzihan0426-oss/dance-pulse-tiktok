import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Segment } from "@/lib/types";
import { getSectionTone } from "@/lib/section-tone";

export function SectionGroupCard({
  lessonId,
  label,
  segments,
  learnedSet,
  resumeSegmentId,
}: {
  lessonId: string;
  label: string;
  segments: Segment[];
  learnedSet: Set<string>;
  resumeSegmentId?: string | null;
}) {
  const tone = getSectionTone(label);
  const total = segments.length;
  const learned = segments.filter((segment) => learnedSet.has(segment.id)).length;
  const percent = total > 0 ? Math.round((learned / total) * 100) : 0;
  const previewSegment = segments[0] ?? null;

  return (
    <div className="relative overflow-hidden rounded-[24px] bg-bg-surface px-4 py-4 md:min-h-[350px] md:rounded-[28px] md:px-5 md:py-5">
      {previewSegment?.thumbnail && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSegment.thumbnail}
            alt={`${label} 背景预览图`}
            className="absolute inset-0 h-full w-full object-cover opacity-18"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(58,31,74,0.42)_0%,rgba(23,22,42,0.84)_28%,rgba(23,22,42,0.96)_62%,rgba(23,22,42,1)_100%)]" />
        </>
      )}

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[11px] font-medium md:text-[12px] ${tone.chip}`}>
                {label}
              </span>
              <span className="text-[12px] text-white/40 md:text-[13px]">{total} 张</span>
            </div>
            <div className="mt-3 text-[14px] text-white/45 md:text-[15px]">
              已学 {learned}/{total}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[18px] font-semibold text-white md:text-[22px]">{percent}%</div>
            <div className="mt-1 text-[12px] text-white/35 md:text-[13px]">section</div>
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="mt-4 space-y-3">
          {segments.slice(0, 4).map((segment, index) => (
            <Link
              key={segment.id}
              href={`/player/${segment.id}?lesson=${lessonId}`}
              className={[
                "flex items-center justify-between rounded-[18px] border px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm transition md:px-4 md:py-3.5",
                index === 3 ? "hidden md:flex" : "",
                segment.id === resumeSegmentId
                  ? "border-brand-light/70 bg-[rgba(168,85,247,0.16)] hover:bg-[rgba(168,85,247,0.22)]"
                  : "border-white/10 bg-[rgba(11,10,20,0.48)] hover:bg-[rgba(255,255,255,0.08)]",
              ].join(" ")}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate text-white md:text-[15px]">{segment.section_label}</div>
                  {segment.id === resumeSegmentId && (
                    <span className="rounded-full bg-brand/18 px-2 py-0.5 text-[10px] font-medium tracking-[0.12em] text-brand-light">
                      继续
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[12px] text-white/40 md:text-[13px]">
                  {segment.beat_count} 拍 · {segment.duration.toFixed(2)}s
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-white/35" />
            </Link>
          ))}
        </div>

        {segments.length > 4 && (
          <div className="mt-3 text-right text-[12px] text-white/35">
            还有 {segments.length - 4} 张动作卡
          </div>
        )}
      </div>
    </div>
  );
}
