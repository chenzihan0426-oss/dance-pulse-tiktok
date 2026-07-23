"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, ChevronRight, Play, Sparkles, Video, Zap } from "lucide-react";
import { DancePulseLogo } from "@/components/brand/DancePulseLogo";
import { SyncPromptCard } from "@/components/auth/SyncPromptCard";
import { useAuth } from "@/hooks/useAuth";
import { useLessonsWithProgress } from "@/hooks/useLessonsWithProgress";
import { WEEKLY_CHALLENGE } from "@/lib/communityShowcase";
import { resolveMediaUrl } from "@/lib/api";

const COVER_COLORS = ["#ff0055", "#00f3ff", "#ccff00", "#9d4edd", "#ffaa00"];
const INSTRUCTORS = ["J-HOPE Style", "Urban King", "Lisa Flow", "Neon Unit", "Street Core"];
const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"];

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const { lessons, progressMap, loading } = useLessonsWithProgress();

  const displayLessons = React.useMemo(() => {
    return lessons.slice(0, 6).map((lesson, index) => {
      const progress = progressMap[lesson.id];
      const learned = progress?.learned ?? 0;
      const total = progress?.total ?? 1;
      const pct = total > 0 ? Math.round((learned / total) * 100) : lesson.demo_ready ? 100 : lesson.confirmed ? 65 : 0;
      return {
        id: lesson.id,
        title: lesson.title,
        instructor: INSTRUCTORS[index % INSTRUCTORS.length],
        difficulty: DIFFICULTIES[index % DIFFICULTIES.length],
        progress: pct,
        cover: COVER_COLORS[index % COVER_COLORS.length],
        thumbnail: lesson.thumbnail ? resolveMediaUrl(lesson.thumbnail) : "",
        demoReady: Boolean(lesson.demo_ready),
      };
    });
  }, [lessons, progressMap]);

  const challengeLessonId = React.useMemo(() => {
    const demo = lessons.find((l) => l.demo_ready);
    return demo?.id ?? WEEKLY_CHALLENGE.lessonId ?? lessons[0]?.id ?? null;
  }, [lessons]);

  return (
    <main className="relative mx-auto min-h-screen max-w-md overflow-x-hidden bg-transparent pb-4 pt-6 font-sans text-white selection:bg-[#ff0055] selection:text-white">
      {!isAuthenticated ? (
        <div className="px-5">
          <SyncPromptCard variant="compact" />
        </div>
      ) : null}

      <header className="relative flex flex-col items-center overflow-hidden px-5 pb-8 pt-4 text-center">
        <DancePulseLogo className="h-14 w-14" />
        <h1 className="kpop-glitch mt-4 select-none text-[42px] font-black uppercase leading-none tracking-tighter">
          DANCE PULSE
        </h1>
        <p className="mt-3 max-w-xs text-[13px] leading-6 text-white/50">
          K-pop 编舞拆片 · 跟拍打分 · 社区同舞
        </p>

        <Link
          href="/learn"
          className="btn-strike z-10 mt-8 inline-flex min-h-[52px] items-center px-8 py-3 text-[15px] font-bold uppercase tracking-widest transition-colors active:text-[#050505]"
        >
          <span className="relative z-10 flex items-center gap-3">
            开始律动
            <Play size={18} fill="currentColor" />
          </span>
        </Link>
        {challengeLessonId ? (
          <Link
            href={`/lesson/${challengeLessonId}/tracking-desktop`}
            className="z-10 mt-3 inline-flex min-h-[48px] items-center gap-2 rounded-full border border-[#ff0055]/50 bg-[#ff0055]/20 px-6 py-2.5 text-[14px] font-bold text-[#ff8fb3] transition active:bg-[#ff0055]/35"
          >
            <Sparkles size={16} />
            直接进入跟拍挑战
          </Link>
        ) : null}

        <div className="absolute bottom-2 flex h-12 items-end gap-1 opacity-30">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="bar w-1 bg-white" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </header>

      <div className="relative z-10 my-6 w-full scale-[1.02] -rotate-1 overflow-hidden border-y border-[#ccff00]/50 bg-[#ccff00] py-3 text-[#050505]">
        <div className="marquee-container text-lg font-black uppercase tracking-widest">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-3">
              <span>跳舞吧！</span>
              <Sparkles size={18} />
              <span>DANCE PULSE</span>
              <Zap size={18} />
              <span>STREET VIBE</span>
              <Activity size={18} />
              <span>NEON FLOW</span>
            </div>
          ))}
        </div>
      </div>

      <section className="relative z-10 px-5">
        <Link
          href={
            challengeLessonId
              ? `/lesson/${challengeLessonId}/tracking-desktop`
              : "/community?tab=arena"
          }
          className="group flex flex-col gap-4 overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(110deg,rgba(255,0,85,0.18),rgba(0,243,255,0.08),rgba(5,5,5,0.95))] px-5 py-5 transition active:border-white/25"
        >
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#ff0055]">本周同舞挑战</div>
            <h3
              className="mt-2 text-[24px] font-black tracking-tight text-white"
              style={{ fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif", transform: "skewX(-6deg)" }}
            >
              ANTIFRAGILE · 跟拍挑战
            </h3>
            <p className="mt-2 text-[13px] text-white/55">
              {WEEKLY_CHALLENGE.participants.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} 人已参与 · 最高{" "}
              {WEEKLY_CHALLENGE.topScore} 分 · 点此直接开摄像头跟拍
            </p>
          </div>
          <span className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-[14px] font-bold text-black transition group-active:bg-[#ccff00]">
            立即跟拍挑战 <ChevronRight size={16} />
          </span>
        </Link>
      </section>

      <section id="lessons" className="relative z-10 px-5 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <h3
            className="text-[28px] font-bold uppercase tracking-tighter"
            style={{ fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif", transform: "skewX(-8deg)" }}
          >
            课程
            <br />
            <span className="kpop-text">LESSONS</span>
          </h3>
          <Link
            href="/learn"
            className="flex min-h-[44px] items-center gap-1 text-[12px] uppercase tracking-widest text-white/50 transition active:text-white"
            style={{ transform: "skewX(-8deg)" }}
          >
            全部 <ChevronRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[320px] animate-pulse border border-white/10 bg-black/40" />
            ))}
          </div>
        ) : displayLessons.length === 0 ? (
          <div className="border border-dashed border-white/10 px-4 py-10 text-center text-[13px] text-white/40">
            还没有课程，先去导入一支舞曲吧。
          </div>
        ) : (
          <div className="space-y-5">
            {displayLessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/lesson/${lesson.id}`}
                className="neon-card group relative flex flex-col overflow-hidden border border-white/10 bg-[#0a0a0a]/90 p-1 active:scale-[0.99]"
                style={{ "--hover-color": lesson.cover } as React.CSSProperties}
              >
                <div
                  className="relative aspect-[16/10] w-full overflow-hidden bg-[#111] bg-cover bg-center"
                  style={lesson.thumbnail ? { backgroundImage: `url("${lesson.thumbnail}")` } : undefined}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.8)_0%,transparent_100%)] opacity-20 mix-blend-overlay" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Video size={40} color={lesson.cover} className="opacity-50" />
                  </div>
                  <div className="absolute left-3 top-3 border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] font-mono uppercase text-white/80 backdrop-blur-md">
                    {lesson.difficulty}
                  </div>
                </div>

                <div className="flex flex-col justify-between p-4">
                  <div>
                    <h4
                      className="line-clamp-1 text-[17px] font-bold uppercase tracking-wide text-white"
                      style={{ fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif" }}
                    >
                      {lesson.title}
                    </h4>
                    <p className="mt-1.5 text-[13px] text-white/40">{lesson.instructor}</p>
                  </div>

                  <div className="mt-4 w-full">
                    <div className="mb-2 flex justify-between text-[11px] font-mono text-white/50">
                      <span>PROGRESS</span>
                      <span style={{ color: lesson.progress > 0 ? lesson.cover : undefined }}>{lesson.progress}%</span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full transition-all duration-1000 ease-out"
                        style={{ width: `${lesson.progress}%`, backgroundColor: lesson.cover }}
                      />
                    </div>
                    {lesson.demoReady ? (
                      <span
                        role="link"
                        tabIndex={0}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.location.href = `/lesson/${lesson.id}/tracking-desktop`;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            window.location.href = `/lesson/${lesson.id}/tracking-desktop`;
                          }
                        }}
                        className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center rounded-full bg-[#ff0055]/90 text-[12px] font-bold text-white"
                      >
                        跟拍挑战
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-white/10 py-10 text-center text-[10px] font-medium uppercase tracking-[0.3em] text-white/20">
        DANCE PULSE // MOBILE V1.1
      </footer>
    </main>
  );
}
