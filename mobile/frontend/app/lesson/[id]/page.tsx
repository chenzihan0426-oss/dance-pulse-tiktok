"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  Music,
  PlayCircle,
  Sparkles,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { ProgressRing } from "@/components/ProgressRing";
import { Button } from "@/components/ui/button";
import { getLesson, regenerateTeaching } from "@/lib/api";
import { getLastViewedSegmentId } from "@/lib/storage";
import type { Lesson, Segment } from "@/lib/types";
import { useLearningProgress } from "@/hooks/useLearningProgress";
import { lessonIsDemoReady, segmentIsReady } from "@/lib/demoReady";
import { LessonCoverFocusPlayer } from "@/components/lesson/LessonCoverFocusPlayer";
import { SimilarRecommendPanel } from "@/components/lesson/SimilarRecommendPanel";
import { TeachingPanelKpop } from "@/components/TeachingPanelKpop";
import { cn } from "@/lib/utils";

type LessonBottomTab = "similar" | "segments";

function formatDuration(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function LessonPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const lessonId = params?.id ?? "antifragile_dp";
  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [lastViewedSegmentId, setLastViewedSegmentId] = React.useState<string | null>(null);
  const [activeTeachingSegId, setActiveTeachingSegId] = React.useState<string | null>(null);
  const [regeneratingSegId, setRegeneratingSegId] = React.useState<string | null>(null);
  const [bottomTab, setBottomTab] = React.useState<LessonBottomTab>("segments");
  const [focusPreview, setFocusPreview] = React.useState(false);
  const detailRef = React.useRef<HTMLDivElement | null>(null);

  const progress = useLearningProgress(lessonId);
  const { learnedIds, learnedCount, total, percent, isLearned, setTotal } = progress;

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const detail = await getLesson(lessonId);
        if (!cancelled) {
          setLesson(detail);
          setTotal(
            detail.segments.filter((segment) => !segment.is_still && !segment.deleted).length
          );
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

  const handleToggleTeaching = React.useCallback((segId: string) => {
    setActiveTeachingSegId((prev) => {
      const next = prev === segId ? null : segId;
      if (next) {
        requestAnimationFrame(() => {
          detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return next;
    });
  }, []);

  const handleRegenerate = React.useCallback(
    async (segId: string) => {
      if (!lesson) return;
      setRegeneratingSegId(segId);
      try {
        await regenerateTeaching(lesson.id, segId);
        let tries = 0;
        const poll = async () => {
          try {
            const fresh = await getLesson(lesson.id);
            setLesson(fresh);
            const updated = fresh.segments.find((s) => s.id === segId);
            if (updated?.teaching?.status === "pending" && tries < 6) {
              tries += 1;
              setTimeout(poll, 3000);
            }
          } catch (err) {
            console.error("poll teaching failed", err);
          }
        };
        setTimeout(poll, 1200);
      } catch (err) {
        console.error("regenerate teaching failed", err);
      } finally {
        setRegeneratingSegId(null);
      }
    },
    [lesson]
  );

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

  const primaryActionLabel =
    learnedCount === 0
      ? resumeIndex >= 0
        ? `开始学习 · 第 ${resumeIndex + 1} 张`
        : "开始学习"
      : resumeIndex >= 0
        ? `继续学习 · 第 ${resumeIndex + 1} 张`
        : "继续学习";
  const adjustHref = `/lesson/${lessonId}/adjust`;

  React.useEffect(() => {
    if (!starterSegment || !lesson) return;
    router.prefetch(`/player/${starterSegment.id}?lesson=${lesson.id}`);
  }, [lesson, router, starterSegment]);

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-8 text-white">
        <div className="aspect-[9/16] animate-pulse rounded-[32px] bg-bg-raised" />
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

  const activeSegments: Segment[] = learnableSegments;
  const demoReady = lessonIsDemoReady(lesson);

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-8 text-white">
      <Link
        href="/learn"
        className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回学习页
      </Link>

      <section className="mt-6">
        <LessonCoverFocusPlayer
          focused={focusPreview}
          lesson={lesson}
          segments={activeSegments}
          onFocus={() => setFocusPreview(true)}
          onCollapse={() => setFocusPreview(false)}
        />

        <div className="mt-5">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
              demoReady
                ? "border border-amber-300/40 bg-amber-400/10 text-amber-200"
                : "border border-white/10 bg-white/6 text-white/45"
            )}
          >
            <Sparkles className="h-3 w-3" />
            {demoReady ? "DEMO 就绪" : "跟拍未就绪"}
          </div>

          <h1 className="mt-3 text-[28px] font-black leading-tight tracking-tight text-white">
            {lesson.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-[13px] text-white/55">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {formatDuration(lesson.duration)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Music className="h-3.5 w-3.5" />
              BPM {Math.round(lesson.bpm)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              {activeSegments.length} 段动作
            </span>
          </div>

          {resumeSegment && resumeIndex >= 0 ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13px] text-white/72">
              <span className="text-white/50">上次学到</span>
              <span className="font-medium text-white">
                {resumeSegment.section_label} · 第 {resumeIndex + 1} 张
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-[28px] bg-[#18162B] px-5 py-5">
        <ProgressRing percent={percent} label={`已学 ${learnedCount}/${Math.max(total, 0)}`} />

        <div className="mt-6 flex flex-col gap-3">
          {demoReady ? (
            <Link href={`/lesson/${lesson.id}/tracking-desktop`}>
              <Button
                variant="primary"
                className="h-14 w-full rounded-[18px] bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] text-[15px] font-bold text-white"
              >
                <WandSparkles className="h-4 w-4" />
                跟拍挑战
              </Button>
            </Link>
          ) : (
            <Button
              variant="secondary"
              disabled
              className="h-14 w-full rounded-[18px] text-[15px] opacity-50"
            >
              <WandSparkles className="h-4 w-4" />
              跟拍未就绪
            </Button>
          )}
          <Link href={`/player/${starterSegment?.id ?? lesson.segments[0]?.id}?lesson=${lesson.id}`}>
            <Button variant="secondary" className="h-14 w-full rounded-[18px] text-[15px]">
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
      </section>

      {(() => {
        const inner = (
          <div className="flex items-start justify-between gap-4">
            <div>
              <div
                className={`inline-flex rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${
                  demoReady ? "bg-amber-400/20 text-amber-200" : "bg-white/10 text-white/45"
                }`}
              >
                {demoReady ? "✨ DEMO 就绪" : "未就绪"}
              </div>
              <div className="mt-3 text-[20px] font-semibold text-white">沉浸跟练</div>
              <div className="mt-2 text-[13px] leading-6 text-white/55">
                {demoReady
                  ? "这支 lesson 已完整预处理，进去就能全屏跟练，光影人和追踪骨架会叠在画面中。"
                  : "这支 lesson 姿态/切片还没完全处理好，暂不能跟拍挑战。请先选其他带 DEMO 标的 lesson。"}
              </div>
            </div>
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full ${
                demoReady ? "bg-amber-400/20 text-amber-200" : "bg-white/10 text-white/40"
              }`}
            >
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
            <div className="mt-4 text-center text-[13px] font-semibold text-amber-200">点此进入跟拍挑战 →</div>
          </Link>
        ) : (
          <div className="mt-6 block cursor-not-allowed rounded-[28px] border border-white/10 bg-white/[0.03] px-5 py-5 opacity-70">
            {inner}
          </div>
        );
      })()}

      <section className="mt-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="inline-flex rounded-2xl border border-white/12 bg-black/40 p-1">
            {(
              [
                { id: "segments" as const, label: "详细解析" },
                { id: "similar" as const, label: "相似推荐" },
              ] as const
            ).map((tab) => {
              const active = bottomTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setBottomTab(tab.id);
                    if (tab.id !== "segments") setActiveTeachingSegId(null);
                  }}
                  className={cn(
                    "rounded-xl px-4 py-2 text-[13px] font-semibold transition",
                    active ? "bg-white text-black" : "text-white/65"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          {bottomTab === "segments" ? (
            <span className="text-[11px] uppercase tracking-[0.16em] text-white/40">
              READY {activeSegments.filter(segmentIsReady).length}/{activeSegments.length}
            </span>
          ) : null}
        </div>

        {bottomTab === "similar" ? <SimilarRecommendPanel lessonId={lesson.id} /> : null}

        {bottomTab === "segments" ? (
          <div className="grid grid-cols-2 gap-3">
            {activeSegments.map((seg, idx) => {
              const learned = isLearned(seg.id);
              const ready = segmentIsReady(seg);
              const cover = idx % 2 === 0 ? "#00f3ff" : "#ff0055";
              const teachingStatus = seg.teaching?.status;
              const isExpanded = activeTeachingSegId === seg.id;
              const showTeachingBtn = !seg.is_still && !!seg.teaching;

              return (
                <div
                  key={seg.id}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] p-1"
                  style={{ boxShadow: `0 0 0 1px ${cover}11` }}
                >
                  <Link href={`/player/${seg.id}?lesson=${lesson.id}`} className="block">
                    <div className="relative aspect-[9/16] w-full overflow-hidden">
                      <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-active:scale-[1.03]"
                        style={{ backgroundImage: `url("${seg.thumbnail}")` }}
                      />
                      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_45%,rgba(0,0,0,0.85)_100%)]" />
                      <div className="absolute left-2 top-2 rounded-full border border-white/20 bg-black/55 px-2 py-0.5 text-[9px] uppercase tracking-wider text-white/85">
                        #{idx + 1}
                      </div>
                      {ready ? (
                        <div className="absolute right-2 top-2 rounded-full bg-amber-400/95 px-1.5 py-0.5 text-[8px] font-bold text-amber-950">
                          READY
                        </div>
                      ) : null}
                      {learned ? (
                        <div className="absolute right-2 top-7 rounded-full bg-emerald-400/95 px-1.5 py-0.5 text-[8px] font-bold text-emerald-950">
                          LEARNED
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          "absolute inset-x-0 px-2",
                          showTeachingBtn ? "bottom-[52px]" : "bottom-2"
                        )}
                      >
                        <div className="line-clamp-1 text-[12px] font-semibold text-white">
                          {seg.section_label}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[9px] text-white/55">
                          <span>{seg.duration.toFixed(1)}s</span>
                          <span>{seg.beat_count} 拍</span>
                        </div>
                      </div>
                    </div>
                  </Link>

                  {showTeachingBtn ? (
                    <div className="absolute inset-x-1 bottom-1 z-10 rounded-b-xl border-t border-[#00f3ff]/20 bg-black/85 px-2 py-2 backdrop-blur-sm">
                      <div className="flex items-start justify-between gap-1">
                        <p className="line-clamp-2 flex-1 text-[9px] leading-snug text-white/70">
                          {teachingStatus === "ready"
                            ? seg.teaching!.summary
                            : teachingStatus === "pending"
                              ? "教学生成中..."
                              : "教学未就绪"}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleToggleTeaching(seg.id);
                          }}
                          className={cn(
                            "inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition",
                            isExpanded
                              ? "border-[#ccff00] bg-[#ccff00] text-[#050505]"
                              : "border-[#00f3ff]/60 bg-[#00f3ff]/10 text-[#00f3ff]"
                          )}
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          <ChevronDown
                            className={cn("h-2.5 w-2.5 transition-transform", isExpanded && "rotate-180")}
                          />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {bottomTab === "segments" && activeTeachingSegId
        ? (() => {
            const activeSeg = activeSegments.find((s) => s.id === activeTeachingSegId);
            if (!activeSeg) return null;
            const activePracticeNo = activeSegments.findIndex((s) => s.id === activeSeg.id) + 1;
            return (
              <section ref={detailRef} className="mt-6">
                <div className="rounded-3xl border border-[#00f3ff]/30 bg-gradient-to-br from-[#0a0a0a] to-[#1a0033]/40 p-5 shadow-[0_30px_80px_rgba(0,243,255,0.12)]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-black uppercase tracking-tight text-[#00f3ff]">
                      AI 图文教学
                      <span className="mt-1 block text-[12px] font-normal normal-case tracking-normal text-white/50">
                        #{activePracticeNo} · {activeSeg.section_label}
                      </span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTeachingSegId(null)}
                      className="rounded-full border border-white/20 bg-white/5 p-2 text-white/70 transition hover:border-[#ff0055]/60 hover:bg-[#ff0055]/10 hover:text-[#ff0055]"
                      aria-label="关闭教学详情"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div
                    className="mb-5 aspect-[9/16] w-full overflow-hidden rounded-2xl border border-white/10 bg-cover bg-center shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
                    style={{ backgroundImage: `url("${activeSeg.thumbnail}")` }}
                  />
                  <TeachingPanelKpop
                    segment={activeSeg}
                    regenerating={regeneratingSegId === activeSeg.id}
                    onRegenerate={() => handleRegenerate(activeSeg.id)}
                  />
                </div>
              </section>
            );
          })()
        : null}
    </main>
  );
}
