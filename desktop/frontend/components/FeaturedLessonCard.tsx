import React from "react";
import Link from "next/link";
import type { LessonListItem } from "@/lib/types";

function formatArtistLine(lesson: LessonListItem) {
  return `${lesson.bpm} BPM`;
}

export function FeaturedLessonCard({
  lesson,
  progress,
  resumeMeta,
  loading,
  error,
}: {
  lesson: LessonListItem | null;
  progress?: { learned: number; total: number };
  resumeMeta?: { index: number; sectionLabel: string } | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return <div className="h-[290px] animate-pulse rounded-[32px] bg-bg-raised" />;
  }

  if (error || !lesson) {
    return (
      <div className="rounded-[32px] bg-bg-raised px-6 py-8 text-sm text-white/45">
        暂时还没有可继续学习的课程。
      </div>
    );
  }

  const learned = progress?.learned ?? 0;
  const total = Math.max(progress?.total ?? 0, 1);
  const percent = Math.min(100, Math.round((learned / total) * 100));

  return (
    <Link
      href={`/lesson/${lesson.id}`}
      className="block overflow-hidden rounded-[32px] border border-white/6 bg-bg-raised transition hover:brightness-105"
    >
      <div className="relative min-h-[236px] overflow-hidden bg-[linear-gradient(180deg,#41224D_0%,#3A1E47_56%,#231124_100%)] px-6 pb-7 pt-7">
        {lesson.thumbnail ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lesson.thumbnail}
              alt={`${lesson.title} 预览图`}
              className="absolute inset-0 h-full w-full object-cover opacity-28"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(65,34,77,0.28)_0%,rgba(58,30,71,0.58)_44%,rgba(35,17,36,0.92)_100%)]" />
          </>
        ) : null}

        <div className="relative z-10">
          <span className="inline-flex rounded-full bg-[#5A2C7B] px-5 py-2 text-[14px] font-medium text-[#E3C3FF]">
            正在学
          </span>

          <div className="mt-[112px]">
            <h2 className="text-[24px] font-semibold uppercase tracking-tight text-white">
              {lesson.title}
            </h2>
            <p className="mt-2 text-[14px] text-white/55">{formatArtistLine(lesson)}</p>
            {resumeMeta ? (
              <div className="mt-4 inline-flex items-center rounded-full bg-white/10 px-4 py-2 text-[13px] text-white/76">
                上次学到 {resumeMeta.sectionLabel} · 第 {resumeMeta.index + 1} 张
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="bg-[#1A1830] px-6 py-5">
        <div className="flex items-center justify-between text-[15px] text-white/65">
          <span>已学 {learned}/{total}</span>
          <span className="font-semibold text-brand-light">{percent}%</span>
        </div>
        <div className="mt-4 h-2 rounded-full bg-white/10">
          <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-4 flex items-center justify-between text-[14px] text-white/52">
          <span>
            {resumeMeta
              ? `继续第 ${resumeMeta.index + 1} 张`
              : learned > 0
                ? "继续这门课"
                : "从第一张开始"}
          </span>
          <span className="font-medium text-brand-light">进入课程</span>
        </div>
      </div>
    </Link>
  );
}
