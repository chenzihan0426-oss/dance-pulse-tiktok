"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Play, PlayCircle, Sparkles, WandSparkles } from "lucide-react";
import { ProgressRing } from "@/components/ProgressRing";
import { SectionGroupCard } from "@/components/SectionGroupCard";
import { Button } from "@/components/ui/button";
import { getLesson } from "@/lib/api";
import { getLastViewedSegmentId } from "@/lib/storage";
import type { Lesson } from "@/lib/types";
import { useLearningProgress } from "@/hooks/useLearningProgress";
import { lessonIsDemoReady } from "@/lib/demoReady";

export default function LessonPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const lessonId = params?.id ?? "antifragile_dp";
  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [lastViewedSegmentId, setLastViewedSegmentId] = React.useState<string | null>(null);

  const progress = useLearningProgress(lessonId);
  const {
    learnedIds,
    learnedCount,
    total,
    percent,
    isLearned,
    setTotal,
  } = progress;

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const detail = await getLesson(lessonId);
        if (!cancelled) {
          setLesson(detail);
          const nextTotal = detail.segments.filter(
            (segment) => !segment.is_still && !segment.deleted
          ).length;
          setTotal(nextTotal);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lessonId, setTotal]);

  React.useEffect(() => {
    setLastViewedSegmentId(getLastViewedSegmentId(lessonId));
  }, [lessonId]);

  const learnableSegments = React.useMemo(
    () => lesson?.segments.filter((segment) => !segment.deleted && !segment.is_still) ?? [],
    [lesson]
  );

  const resumeSegment = React.useMemo(() => {
    if (!lastViewedSegmentId) return null;
    return (
      learnableSegments.find(
        (segment) => segment.id === lastViewedSegmentId && !isLearned(segment.id)
      ) ?? null
    );
  }, [isLearned, lastViewedSegmentId, learnableSegments]);

  const starterSegment =
    resumeSegment ??
    learnableSegments.find((segment) => !isLearned(segment.id)) ??
    learnableSegments[0] ??
    lesson?.segments.find((segment) => !segment.deleted) ??
    null;
  const resumeIndex = starterSegment
    ? learnableSegments.findIndex((segment) => segment.id === starterSegment.id)
    : -1;

  const previewSegment = starterSegment ?? learnableSegments[0] ?? lesson?.segments[0] ?? null;
  const firstSegment =
    learnableSegments[0] ?? lesson?.segments.find((segment) => !segment.deleted) ?? null;
  const primaryActionLabel =
    learnedCount === 0
      ? resumeIndex >= 0
        ? `开始学习 · 第 ${resumeIndex + 1} 张`
        : "开始学习"
      : resumeIndex >= 0
        ? `继续学习 · 第 ${resumeIndex + 1} 张`
        : "继续学习";
  const adjustHref = `/lesson/${lessonId}/adjust`;

  const groupedSections = React.useMemo(() => {
    if (!lesson) return [];
    return lesson.sections
      .map((section) => ({
        id: section.id,
        label: section.label,
        segments: lesson.segments.filter(
          (segment) => !segment.deleted && !segment.is_still && segment.section === section.id
        ),
      }))
      .filter((section) => section.segments.length > 0);
  }, [lesson]);

  React.useEffect(() => {
    if (!starterSegment || !lesson) return;
    router.prefetch(`/player/${starterSegment.id}?lesson=${lesson.id}`);
  }, [lesson, router, starterSegment]);

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-8 text-white">
        <div className="h-[300px] animate-pulse rounded-[32px] bg-bg-raised" />
      </main>
    );
  }

  if (error || !lesson) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-8 text-white">
        <div className="rounded-[24px] border border-state-danger/20 bg-state-danger/10 px-5 py-5 text-sm text-red-200">
          课程加载失败：{error ?? "未知错误"}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-8 text-white">
      <Link
        href="/learn"
        className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回学习页
      </Link>

      <section className="mt-6 overflow-hidden rounded-[32px] bg-bg-raised">
        <div className="relative min-h-[300px] overflow-hidden bg-[linear-gradient(135deg,#3A1F4A_0%,#24102D_100%)] px-6 pb-6 pt-6">
          {previewSegment?.thumbnail && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSegment.thumbnail}
                alt={`${lesson.title} 预览图`}
                className="absolute inset-0 h-full w-full object-cover opacity-30"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(27,14,38,0.35)_0%,rgba(35,16,46,0.72)_50%,rgba(24,13,33,0.96)_100%)]" />
            </>
          )}

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[12px] uppercase tracking-[0.18em] text-white/65">
              <Sparkles className="h-3.5 w-3.5" />
              LESSON
            </div>

            <div className="mt-8 flex items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="line-clamp-2 text-[32px] font-semibold uppercase tracking-tight text-white">
                  {lesson.title}
                </h1>
                <p className="mt-3 text-[15px] text-white/50">
                  {Math.round(lesson.duration)} 秒 · {Math.round(lesson.bpm)} BPM
                </p>
              </div>

              {previewSegment?.thumbnail && (
                <div className="overflow-hidden rounded-[22px] border border-white/10 bg-black/20 shadow-[0_16px_30px_rgba(0,0,0,0.18)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewSegment.thumbnail}
                    alt={`${lesson.title} 缩略图`}
                    className="h-28 w-20 object-cover"
                  />
                </div>
              )}
            </div>

            <div className="mt-8 rounded-[20px] bg-black/18 px-4 py-4 text-[14px] leading-6 text-white/62 backdrop-blur-sm">
              先从推荐的动作卡开始，完成一张后会顺着进入下一张继续练习。
            </div>

            {resumeSegment && resumeIndex >= 0 && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13px] text-white/72">
                <span className="text-white/50">上次学到</span>
                <span className="font-medium text-white">
                  {resumeSegment.section_label} · 第 {resumeIndex + 1} 张
                </span>
              </div>
            )}

            {firstSegment ? (
              <Link
                href={`/player/${firstSegment.id}?lesson=${lesson.id}&mode=fullplay`}
                className="absolute bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/55"
                aria-label="完整预览"
              >
                <Play className="h-4 w-4 fill-current" />
              </Link>
            ) : null}
          </div>
        </div>

        <div className="bg-[#18162B] px-6 py-6">
          <ProgressRing
            percent={percent}
            label={`已学 ${learnedCount}/${Math.max(total, 0)}`}
          />

          <div className="mt-6 flex flex-col gap-3">
            <Link href={`/player/${starterSegment?.id ?? lesson.segments[0]?.id}?lesson=${lesson.id}`}>
              <Button variant="primary" className="h-14 w-full rounded-[18px] text-[15px]">
                <PlayCircle className="h-4 w-4" />
                {primaryActionLabel}
              </Button>
            </Link>
            <Link href={adjustHref}>
              <button
                type="button"
                className="w-full text-center text-[13px] text-white/40 transition hover:text-white/70"
              >
                AI 分段不对？手动调整
              </button>
            </Link>
          </div>
        </div>
      </section>

      {(() => {
        const demoReady = lessonIsDemoReady(lesson);
        const inner = (
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className={`inline-flex rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${
                demoReady ? "bg-amber-400/20 text-amber-200" : "bg-white/10 text-white/45"
              }`}>
                {demoReady ? "✨ DEMO 就绪" : "未就绪"}
              </div>
              <div className="mt-3 text-[20px] font-semibold text-white">沉浸跟练</div>
              <div className="mt-2 text-[13px] leading-6 text-white/55">
                {demoReady
                  ? "这支 lesson 已完整预处理,进去就能全屏跟练,光影人和追踪骨架会叠在画面中。"
                  : "这支 lesson 剪影/粒子还没完全处理好,暂不能跟拍挑战。请先选其他带 DEMO 标的 lesson。"}
              </div>
            </div>
            <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
              demoReady ? "bg-amber-400/20 text-amber-200" : "bg-white/10 text-white/40"
            }`}>
              <WandSparkles className="h-5 w-5" />
            </div>
          </div>
        );
        return demoReady ? (
          <Link
            href={`/lesson/${lesson.id}/tracking-desktop`}
            className="mt-6 block rounded-[28px] border border-amber-300/40 bg-[linear-gradient(135deg,rgba(251,191,36,0.14)_0%,rgba(30,18,51,1)_100%)] px-5 py-5"
          >
            {inner}
          </Link>
        ) : (
          <div className="mt-6 block cursor-not-allowed rounded-[28px] border border-white/10 bg-white/[0.03] px-5 py-5 opacity-70">
            {inner}
          </div>
        );
      })()}

      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-[22px] font-semibold tracking-tight text-white">
            动作分组
          </h2>
          <p className="mt-2 text-[14px] leading-6 text-white/40">
            先按段落推进，再进入每张动作卡继续练习。
          </p>
        </div>

        <div className="space-y-4">
          {groupedSections.map((section) => (
            <SectionGroupCard
              key={section.id}
              lessonId={lesson.id}
              label={section.label}
              segments={section.segments}
              learnedSet={new Set(learnedIds)}
              resumeSegmentId={starterSegment?.id ?? null}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
