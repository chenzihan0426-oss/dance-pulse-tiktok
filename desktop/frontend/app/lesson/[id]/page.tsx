"use client";

// PC 端 lesson 详情页: 影院沉浸风
//   - 顶部: 大号原视频 hero (带背景虚化海报)
//   - 右侧 / 底部: 段落列表 + CTA
//   - 跟拍整支挑战按钮(DEMO 才可点)

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Play, Sparkles, Zap, Clock, Music } from "lucide-react";
import { getLesson } from "@/lib/api";
import { getLastViewedSegmentId } from "@/lib/storage";
import type { Lesson, Segment } from "@/lib/types";
import { useLearningProgress } from "@/hooks/useLearningProgress";
import { lessonIsDemoReady, segmentIsReady } from "@/lib/demoReady";

function formatDuration(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function LessonPageDesktop() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const lessonId = params?.id ?? "";
  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [lastViewedSegmentId, setLastSegId] = React.useState<string | null>(null);
  const { learnedIds, setTotal, isLearned } = useLearningProgress(lessonId);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLesson(lessonId)
      .then((detail) => {
        if (cancelled) return;
        setLesson(detail);
        setTotal(detail.segments.filter((s) => !s.is_still && !s.deleted).length);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lessonId, setTotal]);

  React.useEffect(() => {
    if (!lesson) return;
    setLastSegId(getLastViewedSegmentId(lesson.id));
  }, [lesson]);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-white/40">加载中...</main>;
  }
  if (error || !lesson) {
    return (
      <main className="flex min-h-screen items-center justify-center text-white/60">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-red-200">
          {error ?? "课程不存在"}
        </div>
      </main>
    );
  }

  const activeSegments: Segment[] = lesson.segments.filter((s) => !s.deleted && !s.is_still);
  const demoReady = lessonIsDemoReady(lesson);
  const resumeSegId = lastViewedSegmentId ?? activeSegments[0]?.id;

  return (
    <main className="min-h-screen pb-24">
      {/* HERO: 深色 + 虚化海报 + 视频预览 */}
      <section className="relative flex min-h-[540px] w-full items-end overflow-hidden pb-16 pt-20">
        <div className="absolute inset-0 scale-105 bg-cover bg-center blur-2xl" style={{ backgroundImage: `url("${lesson.thumbnail}")` }} />
        <div className="absolute inset-0 bg-black/55" />

        <div className="relative mx-auto flex w-full max-w-[1560px] gap-16 px-16">
          <Link
            href="/"
            className="absolute left-16 top-2 inline-flex items-center gap-2 text-[13px] text-white/50 transition hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回首页
          </Link>

          {/* 左: 视频预览 */}
          <div className="aspect-[9/16] w-[320px] overflow-hidden rounded-[24px] bg-black shadow-[0_40px_80px_rgba(0,0,0,0.6)]">
            <video
              src={lesson.video_url}
              poster={lesson.thumbnail}
              className="h-full w-full object-cover"
              muted
              autoPlay
              loop
              playsInline
            />
          </div>

          {/* 右: 信息 + CTA */}
          <div className="flex flex-1 flex-col justify-end gap-6">
            {demoReady ? (
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-amber-300/40 bg-amber-400/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">
                <Sparkles className="h-3 w-3" />
                DEMO 就绪
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/6 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                跟拍未就绪
              </div>
            )}

            <h1 className="text-[56px] font-black leading-[1.05] tracking-tight text-white">
              {lesson.title}
            </h1>

            <div className="flex items-center gap-6 text-[13px] text-white/55">
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

            <div className="mt-2 flex flex-wrap items-center gap-3">
              {resumeSegId ? (
                <Link
                  href={`/player/${resumeSegId}?lesson=${lesson.id}`}
                  className="flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-semibold text-black transition hover:bg-white/90"
                >
                  <Play className="h-4 w-4 fill-current" />
                  {lastViewedSegmentId ? "继续学习" : "开始学习"}
                </Link>
              ) : null}
              {demoReady ? (
                <Link
                  href={`/lesson/${lesson.id}/tracking-desktop`}
                  className="flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 px-6 py-3 text-[15px] font-semibold text-white transition hover:brightness-110"
                >
                  <Sparkles className="h-4 w-4" />
                  跟拍挑战
                </Link>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-[13px] text-white/40">
                  跟拍挑战未就绪 (剪影/粒子未完整处理)
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 段落列表 */}
      <section className="mx-auto max-w-[1560px] px-16 pt-16">
        <h2 className="mb-8 text-[24px] font-semibold">动作段落</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {activeSegments.map((seg) => {
            const learned = isLearned(seg.id);
            const ready = segmentIsReady(seg);
            return (
              <Link
                key={seg.id}
                href={`/player/${seg.id}?lesson=${lesson.id}`}
                className="group relative overflow-hidden rounded-2xl bg-white/[0.04] transition hover:bg-white/[0.08]"
              >
                <div
                  className="aspect-[9/16] w-full bg-cover bg-center transition-transform group-hover:scale-[1.04]"
                  style={{ backgroundImage: `url("${seg.thumbnail}")` }}
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_45%,rgba(0,0,0,0.85)_100%)]" />
                <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] tracking-wider text-white/80 backdrop-blur">
                  #{seg.index + 1}
                </div>
                {ready ? (
                  <div className="absolute right-2 top-2 rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[9px] font-bold text-amber-950">
                    ✨
                  </div>
                ) : null}
                {learned ? (
                  <div className="absolute right-2 top-2 rounded-full bg-emerald-400/90 px-1.5 py-0.5 text-[9px] font-bold text-emerald-950">
                    ✓
                  </div>
                ) : null}
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <div className="text-[13px] font-medium text-white">{seg.section_label}</div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-white/55">
                    <span>{seg.duration.toFixed(1)}s</span>
                    <span>{"★".repeat(seg.difficulty)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
