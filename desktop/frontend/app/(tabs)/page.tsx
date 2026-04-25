"use client";

// 影院沉浸风首页:
//   1. Hero 区: 一支 featured demo lesson 占满视口上半,巨大播放按钮 + 标题
//   2. Lesson 网格: DEMO 优先的卡片墙,沉浸 / 简约

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, Sparkles } from "lucide-react";
import { getLessons } from "@/lib/api";
import type { LessonListItem } from "@/lib/types";

function formatDuration(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function DesktopHome() {
  const router = useRouter();
  const [lessons, setLessons] = React.useState<LessonListItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    getLessons()
      .then((list) => { if (!cancelled) setLessons(list); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const demoLessons = lessons.filter((l) => l.demo_ready);
  const otherLessons = lessons.filter((l) => !l.demo_ready && (l.has_video ?? true));
  const hero = demoLessons[0] ?? lessons[0];

  return (
    <main className="min-h-screen">
      {/* HERO */}
      {hero ? (
        <section className="relative h-[72vh] min-h-[540px] w-full overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center transition-[background]"
            style={{ backgroundImage: `url("${hero.thumbnail}")` }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.55)_60%,rgba(0,0,0,1)_100%)]" />
          <div className="absolute inset-0 flex flex-col justify-end gap-6 px-16 pb-24 md:px-24">
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-amber-300/40 bg-amber-400/10 px-4 py-1 text-[12px] font-semibold uppercase tracking-[0.22em] text-amber-200">
              <Sparkles className="h-3 w-3" />
              Featured · DEMO 就绪
            </div>
            <h1 className="max-w-[780px] text-[72px] font-black leading-[1.02] tracking-tight text-white">
              {hero.title}
            </h1>
            <div className="flex items-center gap-5 text-[14px] text-white/60">
              <span>{formatDuration(hero.duration)}</span>
              <span className="h-3 w-px bg-white/20" />
              <span>BPM {Math.round(hero.bpm)}</span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push(`/lesson/${hero.id}/tracking-desktop`)}
                className="group flex items-center gap-3 rounded-full bg-white px-6 py-3 text-[15px] font-semibold text-black transition hover:bg-white/90"
              >
                <Play className="h-4 w-4 fill-current" />
                开始跟拍挑战
              </button>
              <Link
                href={`/lesson/${hero.id}`}
                className="rounded-full border border-white/20 bg-white/5 px-6 py-3 text-[15px] font-medium text-white/85 transition hover:bg-white/12"
              >
                查看详情
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* DEMO 网格 */}
      {demoLessons.length > 1 ? (
        <section className="mx-auto max-w-[1560px] px-16 pt-16">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="text-[28px] font-semibold text-white">DEMO 就绪</h2>
            <span className="text-[12px] uppercase tracking-[0.2em] text-white/40">
              预处理完毕 · 即点即玩
            </span>
          </div>
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
            {demoLessons.slice(1).map((lesson) => (
              <LessonTile key={lesson.id} lesson={lesson} demoBadge />
            ))}
          </div>
        </section>
      ) : null}

      {/* 其他 */}
      {otherLessons.length > 0 ? (
        <section className="mx-auto max-w-[1560px] px-16 py-16">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="text-[28px] font-semibold text-white">更多课程</h2>
            <span className="text-[12px] uppercase tracking-[0.2em] text-white/40">
              学习可用 · 跟拍需预处理
            </span>
          </div>
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
            {otherLessons.map((lesson) => (
              <LessonTile key={lesson.id} lesson={lesson} />
            ))}
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-white/40">
          加载中...
        </div>
      ) : null}
    </main>
  );
}

function LessonTile({ lesson, demoBadge = false }: { lesson: LessonListItem; demoBadge?: boolean }) {
  return (
    <Link
      href={`/lesson/${lesson.id}`}
      className="group relative overflow-hidden rounded-2xl bg-white/[0.04] transition hover:bg-white/[0.08]"
    >
      <div
        className="aspect-[9/16] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.035]"
        style={{ backgroundImage: `url("${lesson.thumbnail}")` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_40%,rgba(0,0,0,0.85)_100%)]" />
      {demoBadge ? (
        <div className="absolute left-3 top-3 rounded-full bg-amber-400/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
          ✨ DEMO
        </div>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="line-clamp-1 text-[16px] font-semibold text-white">{lesson.title}</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/55">
          <span>{formatDuration(lesson.duration)}</span>
          <span className="h-2 w-px bg-white/20" />
          <span>BPM {Math.round(lesson.bpm)}</span>
        </div>
      </div>
    </Link>
  );
}
