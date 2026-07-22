"use client";

// PC /learn: 课程库网格视图 (影院沉浸风)
//   - 大标题 + 上传按钮
//   - DEMO 先、有视频次之、缺数据最后
//   - 每张卡片: 9:16 缩略图 + 标题 + 进度条 + DEMO/学过徽章

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Check, Trash2 } from "lucide-react";
import { deleteLesson, getLessons } from "@/lib/api";
import { buildLessonProgressMaps, type ProgressMap, type ResumeMap } from "@/lib/lesson-progress";
import { PROGRESS_UPDATED_EVENT } from "@/lib/storage";
import { useUserLessonStates } from "@/hooks/useUserLessonStates";
import type { LessonListItem } from "@/lib/types";

function formatDuration(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function LearnPageDesktop() {
  const router = useRouter();
  const [lessons, setLessons] = React.useState<LessonListItem[]>([]);
  const [progressMap, setProgressMap] = React.useState<ProgressMap>({});
  const [resumeMap, setResumeMap] = React.useState<ResumeMap>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // 删除课程:确认 → 后端连原视频/切片等全部清掉 → 从列表移除
  const handleDelete = React.useCallback(async (e: React.MouseEvent, lesson: LessonListItem) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(
      `确定删除《${lesson.title}》吗?\n将同时删除下载的原视频、切片等全部本地文件,不可恢复。`
    );
    if (!ok) return;
    setDeletingId(lesson.id);
    try {
      await deleteLesson(lesson.id);
      setLessons((prev) => prev.filter((l) => l.id !== lesson.id));
    } catch (err) {
      window.alert(`删除失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingId(null);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const list = await getLessons();
        const { progressMap, resumeMap } = await buildLessonProgressMaps(list);
        if (!cancelled) {
          setLessons(list);
          setProgressMap(progressMap);
          setResumeMap(resumeMap);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const onReload = () => void load();
    window.addEventListener(PROGRESS_UPDATED_EVENT, onReload as EventListener);
    window.addEventListener("focus", onReload);
    return () => {
      cancelled = true;
      window.removeEventListener(PROGRESS_UPDATED_EVENT, onReload as EventListener);
      window.removeEventListener("focus", onReload);
    };
  }, []);

  const lessonIds = React.useMemo(() => lessons.map((l) => l.id), [lessons]);
  const { states } = useUserLessonStates(lessonIds);

  const sorted = React.useMemo(() => {
    return [...lessons].sort((a, b) => {
      if ((a.demo_ready ?? false) !== (b.demo_ready ?? false)) return a.demo_ready ? -1 : 1;
      const hasA = a.has_video ?? true;
      const hasB = b.has_video ?? true;
      if (hasA !== hasB) return hasA ? -1 : 1;
      const favA = Boolean(states[a.id]?.favorited);
      const favB = Boolean(states[b.id]?.favorited);
      if (favA !== favB) return favA ? -1 : 1;
      const sA = states[a.id]?.lastStudiedAt ? Date.parse(states[a.id]!.lastStudiedAt!) : 0;
      const sB = states[b.id]?.lastStudiedAt ? Date.parse(states[b.id]!.lastStudiedAt!) : 0;
      if (sA !== sB) return sB - sA;
      return 0;
    });
  }, [lessons, states]);

  return (
    <main className="mx-auto min-h-screen max-w-[1560px] px-16 pb-20 pt-10">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <div className="text-[12px] uppercase tracking-[0.22em] text-white/45">Library</div>
          <h1 className="mt-2 text-[44px] font-bold tracking-tight text-white">课程库</h1>
          <p className="mt-3 text-[14px] text-white/55">选一支开始学习,带 ✨ DEMO 的可以直接跟拍挑战。</p>
        </div>
        <Link
          href="/import"
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-black transition hover:bg-white/90"
        >
          <Plus className="h-4 w-4" />
          导入新视频
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[9/16] animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-200">
          加载失败: {error}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl bg-white/5 px-6 py-12 text-center text-white/45">
          还没有课程,去上传一支视频吧。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {sorted.map((lesson) => {
            const progress = progressMap[lesson.id] ?? { learned: 0, total: 0 };
            const pct = progress.total > 0 ? Math.round((progress.learned / progress.total) * 100) : 0;
            const hasVideo = lesson.has_video ?? true;
            return (
              <Link
                key={lesson.id}
                href={`/lesson/${lesson.id}`}
                className="group relative overflow-hidden rounded-2xl bg-white/[0.04] transition hover:bg-white/[0.08]"
              >
                <div
                  className={`aspect-[9/16] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.035] ${
                    hasVideo ? "" : "grayscale opacity-50"
                  }`}
                  style={{ backgroundImage: `url("${lesson.thumbnail}")` }}
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_40%,rgba(0,0,0,0.86)_100%)]" />

                {lesson.demo_ready ? (
                  <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-400/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
                    <Sparkles className="h-2.5 w-2.5" />
                    DEMO
                  </div>
                ) : !hasVideo ? (
                  <div className="absolute left-3 top-3 rounded-full bg-white/12 px-2 py-0.5 text-[10px] tracking-wider text-white/55">
                    缺数据
                  </div>
                ) : null}

                {pct > 0 ? (
                  <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-emerald-950">
                    {pct === 100 ? <Check className="h-2.5 w-2.5" /> : null}
                    {pct}%
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={(e) => handleDelete(e, lesson)}
                  disabled={deletingId === lesson.id}
                  className="absolute right-3 top-11 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/55 opacity-0 backdrop-blur transition hover:border-red-400/60 hover:bg-red-500/25 hover:text-red-200 group-hover:opacity-100 disabled:opacity-60"
                  aria-label={`删除课程 ${lesson.title}`}
                  title="删除课程(含原视频等本地文件)"
                >
                  <Trash2 className={`h-3 w-3 ${deletingId === lesson.id ? "animate-pulse" : ""}`} />
                </button>

                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="line-clamp-1 text-[16px] font-semibold text-white">{lesson.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-white/55">
                    <span>{formatDuration(lesson.duration)}</span>
                    <span className="h-2 w-px bg-white/20" />
                    <span>BPM {Math.round(lesson.bpm)}</span>
                    {progress.total > 0 ? (
                      <>
                        <span className="h-2 w-px bg-white/20" />
                        <span>{progress.learned}/{progress.total}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
