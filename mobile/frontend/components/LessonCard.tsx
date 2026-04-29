"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ImageOff, Music4 } from "lucide-react";
import type { LessonListItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";

interface LessonCardProps {
  lesson: LessonListItem;
  learnedCount?: number;
  totalCount?: number;
  resumeMeta?: { index: number; sectionLabel: string } | null;
  variant?: "default" | "compact";
}

export function LessonCard({
  lesson,
  learnedCount = 0,
  totalCount = 0,
  resumeMeta = null,
  variant = "default",
}: LessonCardProps) {
  const percent =
    totalCount > 0 ? Math.min(100, Math.round((learnedCount / totalCount) * 100)) : 0;
  const compact = variant === "compact";

  return (
    <Link
      href={`/lesson/${lesson.id}`}
      className={cn(
        "group flex overflow-hidden border border-white/8 bg-bg-surface transition duration-200",
        compact
          ? "items-center rounded-[28px] px-5 py-5"
          : "rounded-[24px] hover:brightness-105"
      )}
    >
      <LessonThumbnail lesson={lesson} compact={compact} />

      <div className={cn("flex min-w-0 flex-1 flex-col justify-between", compact ? "pl-4" : "p-4")}>
        <div>
          <h3 className={cn("truncate font-semibold text-white", compact ? "text-[18px]" : "text-lg")}>
            {lesson.title}
          </h3>
          <p className={cn("mt-1 leading-6 text-white/45", compact ? "text-[13px]" : "text-sm")}>
            {compact
              ? resumeMeta
                ? `${resumeMeta.sectionLabel} · ${lesson.bpm} BPM`
                : `${lesson.bpm} BPM`
              : `${Math.round(lesson.duration)} 秒 · ${lesson.confirmed ? "卡片教程" : "建议先确认切片"}`}
          </p>
        </div>

        {compact ? (
          <div className="mt-4 flex items-center justify-between text-[14px] text-white/45">
            <span>
              {resumeMeta
                ? `继续第 ${resumeMeta.index + 1} 张`
                : totalCount > 0
                  ? learnedCount > 0 && learnedCount < totalCount
                    ? `已学 ${learnedCount}/${totalCount}`
                    : learnedCount >= totalCount
                      ? "已学完"
                      : formatDuration(lesson.duration)
                  : formatDuration(lesson.duration)}
            </span>
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-[18px] bg-white/5 p-3">
              <div className="flex items-center justify-between text-xs text-white/45">
                <span>
                  {resumeMeta
                    ? `继续到 ${resumeMeta.sectionLabel} · 第 ${resumeMeta.index + 1} 张`
                    : learnedCount >= totalCount && totalCount > 0
                      ? "本课已学完"
                      : "学习进度"}
                </span>
                <span>
                  {learnedCount}/{Math.max(totalCount, 0)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-300 via-brand-500 to-pink-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm font-medium text-white">
              <span>
                {resumeMeta
                  ? "继续学习"
                  : learnedCount >= totalCount && totalCount > 0
                    ? "回看课程"
                    : "进入课程"}
              </span>
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
          </>
        )}
      </div>
    </Link>
  );
}

function LessonThumbnail({
  lesson,
  compact,
}: {
  lesson: LessonListItem;
  compact: boolean;
}) {
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [lesson.thumbnail]);

  const hasImage = Boolean(lesson.thumbnail && !imageFailed);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-[linear-gradient(135deg,#32254C_0%,#1D314F_52%,#201626_100%)]",
        compact ? "h-28 w-28 rounded-[22px]" : "min-h-[132px] w-32 sm:w-40 md:w-44"
      )}
    >
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={lesson.thumbnail}
          alt={lesson.title}
          onError={() => setImageFailed(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]",
            compact && "opacity-80"
          )}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70">
            {lesson.has_video === false ? (
              <ImageOff className="h-5 w-5" />
            ) : (
              <Music4 className="h-5 w-5" />
            )}
          </div>
          <span className="line-clamp-2 text-[11px] font-semibold leading-4 text-white/58">
            {lesson.has_video === false ? "封面待生成" : lesson.title}
          </span>
        </div>
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(66,37,87,0.18)_0%,rgba(31,20,45,0.58)_100%)]" />
      {!compact ? (
        <>
          <div className="absolute left-4 top-4 flex items-center gap-2">
            <Badge variant={lesson.confirmed ? "brand" : "warn"}>
              {lesson.confirmed ? "已确认" : "待确认"}
            </Badge>
          </div>
          <div className="absolute bottom-3 right-3">
            <Badge variant="outline" className="bg-black/55 text-white">
              <Music4 className="h-3 w-3" />
              {lesson.bpm} BPM
            </Badge>
          </div>
        </>
      ) : null}
    </div>
  );
}

function formatDuration(duration: number) {
  const totalSeconds = Math.max(0, Math.round(duration));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
