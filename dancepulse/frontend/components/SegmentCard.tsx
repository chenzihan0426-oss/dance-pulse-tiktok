"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import type { Segment } from "@/lib/types";
import { getSectionTone } from "@/lib/section-tone";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";

interface SegmentCardProps {
  segment: Segment;
  lessonId: string;
  learned: boolean;
  onToggleLearned: (segment: Segment) => void;
}

export function SegmentCard({
  segment,
  lessonId,
  learned,
  onToggleLearned,
}: SegmentCardProps) {
  const tone = getSectionTone(segment.section_label || segment.section);
  const summary =
    segment.teaching?.status === "ready"
      ? segment.teaching.summary
      : segment.ai_description || "教学内容准备中";
  const statusText =
    segment.teaching?.status === "pending" ? "教学生成中" : "进入卡片练习";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[24px] border border-white/10 bg-[var(--surface)] shadow-[0_18px_42px_rgba(0,0,0,0.22)] transition",
        "hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(0,0,0,0.28)]",
        segment.is_still && "opacity-50"
      )}
    >
      <div className="flex lg:block">
        <Link
          href={`/player/${segment.id}?lesson=${lessonId}`}
          className="block w-36 shrink-0 lg:w-full"
        >
          <div className="relative aspect-video overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={segment.thumbnail}
              alt={segment.section_label}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  tone.pill
                )}
              >
                {segment.section_label}
              </span>
              {segment.is_still && (
                <Badge variant="outline" className="bg-black/45 text-white">
                  <Lock className="h-3 w-3" />
                  静止
                </Badge>
              )}
              {segment.user_edited && <Badge variant="warn">已编辑</Badge>}
            </div>
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white">
              <span>#{segment.index + 1}</span>
              <span>·</span>
              <span>{segment.duration.toFixed(2)}s</span>
            </div>
          </div>
        </Link>

        <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-white">
                {segment.beat_count} 拍切片
              </div>
              <div className="text-sm text-amber-400">
                {"★".repeat(segment.difficulty)}
                <span className="text-neutral-700">
                  {"★".repeat(Math.max(0, 5 - segment.difficulty))}
                </span>
              </div>
            </div>

            <Link href={`/player/${segment.id}?lesson=${lessonId}`} className="mt-3 block">
              <p className="truncate text-sm leading-6 text-[var(--muted)]">
                {summary}
              </p>
            </Link>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] text-[var(--muted)]">
                {segment.beat_count}拍 · {segment.duration.toFixed(2)}s
              </div>
              <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-brand-light">
                <Sparkles className="h-3 w-3" />
                {statusText}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onToggleLearned(segment)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition",
                learned
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-white/5 text-neutral-100 hover:bg-white/10"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-md border text-xs",
                  learned
                    ? "border-emerald-400/30 bg-emerald-500/20"
                    : "border-white/12 bg-transparent"
                )}
              >
                {learned ? "✓" : ""}
              </span>
              <span>{learned ? "已学会" : "学会"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
