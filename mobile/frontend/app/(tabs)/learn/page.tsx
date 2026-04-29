"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Upload, X } from "lucide-react";
import { SyncPromptCard } from "@/components/auth/SyncPromptCard";
import { SwipeableLessonRow } from "@/components/SwipeableLessonRow";
import { Toast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useLessonsWithProgress } from "@/hooks/useLessonsWithProgress";
import { useToast } from "@/hooks/useToast";
import { useUserLessonStates } from "@/hooks/useUserLessonStates";
import { cn } from "@/lib/utils";

type LessonFilter = "all" | "continue" | "favorite" | "demo" | "draft";

const LESSON_FILTERS: Array<{ value: LessonFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "continue", label: "继续" },
  { value: "favorite", label: "收藏" },
  { value: "demo", label: "Demo" },
  { value: "draft", label: "待确认" },
];

export default function LearnPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { toast, showToast, dismissToast, handleAction } = useToast();
  const { lessons, progressMap, resumeMap, loading, error } = useLessonsWithProgress();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<LessonFilter>("all");
  const [openRowId, setOpenRowId] = React.useState<string | null>(null);

  const lessonIds = React.useMemo(() => lessons.map((lesson) => lesson.id), [lessons]);
  const {
    states,
    enrolledLessons,
    toggleFavorite,
    removeFromEnrolled,
    restoreToEnrolled,
  } = useUserLessonStates(lessonIds);

  const sortedLessons = React.useMemo(() => {
    const order = new Map(lessons.map((lesson, index) => [lesson.id, index]));
    const enrolledSet = new Set(enrolledLessons);

    return lessons
      .filter((lesson) => enrolledSet.has(lesson.id))
      .sort((a, b) => {
        if ((a.demo_ready ?? false) !== (b.demo_ready ?? false)) {
          return a.demo_ready ? -1 : 1;
        }

        const hasA = a.has_video ?? true;
        const hasB = b.has_video ?? true;
        if (hasA !== hasB) return hasA ? -1 : 1;

        const stateA = states[a.id];
        const stateB = states[b.id];
        const favoriteA = Boolean(stateA?.favorited);
        const favoriteB = Boolean(stateB?.favorited);
        if (favoriteA !== favoriteB) {
          return favoriteA ? -1 : 1;
        }

        const studiedA = stateA?.lastStudiedAt ? Date.parse(stateA.lastStudiedAt) : 0;
        const studiedB = stateB?.lastStudiedAt ? Date.parse(stateB.lastStudiedAt) : 0;
        if (studiedA !== studiedB) {
          return studiedB - studiedA;
        }

        return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
      });
  }, [enrolledLessons, lessons, states]);

  const normalizedQuery = query.trim().toLowerCase();

  const visibleLessons = React.useMemo(
    () =>
      sortedLessons.filter((lesson) => {
        const progress = progressMap[lesson.id];
        const favorited = Boolean(states[lesson.id]?.favorited);

        const passesFilter =
          filter === "all" ||
          (filter === "continue" &&
            Boolean(progress && progress.total > 0 && progress.learned > 0 && progress.learned < progress.total)) ||
          (filter === "favorite" && favorited) ||
          (filter === "demo" && Boolean(lesson.demo_ready)) ||
          (filter === "draft" && !lesson.confirmed);

        if (!passesFilter) return false;
        if (!normalizedQuery) return true;

        const searchableText = [
          lesson.title,
          `${lesson.bpm} bpm`,
          lesson.confirmed ? "已确认 confirmed" : "待确认 draft",
          lesson.demo_ready ? "demo 演示 已就绪" : "",
          favorited ? "收藏 favorite" : "",
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedQuery);
      }),
    [filter, normalizedQuery, progressMap, sortedLessons, states]
  );

  React.useEffect(() => {
    visibleLessons.slice(0, 3).forEach((lesson) => {
      router.prefetch(`/lesson/${lesson.id}`);
    });
  }, [router, visibleLessons]);

  React.useEffect(() => {
    setOpenRowId(null);
  }, [filter, query]);

  const handleRemove = React.useCallback(
    (lessonId: string) => {
      setOpenRowId(null);
      removeFromEnrolled(lessonId);
      showToast({
        message: "已从学习列表移除",
        actionLabel: "撤销",
        onAction: () => restoreToEnrolled(lessonId),
        duration: 5000,
      });
    },
    [removeFromEnrolled, restoreToEnrolled, showToast]
  );

  const handleToggleFavorite = React.useCallback(
    (lessonId: string) => {
      setOpenRowId(null);
      toggleFavorite(lessonId);
    },
    [toggleFavorite]
  );

  return (
    <>
      <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-10 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] text-white/45">你的课程库</p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-white">
              学习
            </h1>
          </div>

          <Link
            href="/import"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-brand px-4 text-[14px] font-semibold text-white transition hover:brightness-110"
          >
            <Upload className="h-4 w-4" />
            <span>导入视频</span>
          </Link>
        </div>

        <p className="mt-3 text-[14px] leading-6 text-white/45">
          继续最近的舞蹈，或者导入新的编舞开始练习。
        </p>

        {!isAuthenticated ? <SyncPromptCard variant="compact" /> : null}

        <section className="mt-7 space-y-3">
          <label className="flex h-12 w-full items-center gap-3 rounded-[18px] bg-bg-surface px-4 text-[14px] text-white transition focus-within:ring-2 focus-within:ring-brand/40">
            <Search className="h-[18px] w-[18px] shrink-0 text-white/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/40"
              placeholder="搜索课程 / BPM / 状态"
              aria-label="搜索学习课程"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/40 transition hover:bg-white/[0.06] hover:text-white"
                aria-label="清空搜索"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          <div className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max gap-2">
              {LESSON_FILTERS.map((item) => {
                const active = filter === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    aria-pressed={active}
                    className={cn(
                      "h-9 shrink-0 rounded-full border px-3 text-[13px] font-semibold transition",
                      active
                        ? "border-brand/45 bg-brand/18 text-brand-light"
                        : "border-white/8 bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div className="mt-6 space-y-4">
          {loading ? (
            Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="h-[132px] animate-pulse rounded-[28px] bg-bg-surface"
              />
            ))
          ) : error ? (
            <div className="rounded-[24px] border border-state-danger/20 bg-state-danger/10 px-4 py-5 text-sm text-red-200">
              课程列表加载失败：{error}
            </div>
          ) : sortedLessons.length === 0 ? (
            <div className="rounded-[24px] bg-bg-surface px-4 py-5 text-sm text-white/45">
              你的学习列表现在是空的，先去导入或从推荐里挑一门继续吧。
            </div>
          ) : visibleLessons.length === 0 ? (
            <div className="rounded-[24px] bg-bg-surface px-4 py-5 text-sm text-white/45">
              没有找到匹配课程，换个关键词或筛选条件试试。
            </div>
          ) : (
            visibleLessons.map((lesson) => {
              const progress = progressMap[lesson.id] ?? { learned: 0, total: 0 };
              return (
                <SwipeableLessonRow
                  key={lesson.id}
                  lesson={lesson}
                  favorited={Boolean(states[lesson.id]?.favorited)}
                  isOpen={openRowId === lesson.id}
                  onOpenChange={(open) =>
                    setOpenRowId((current) =>
                      open ? lesson.id : current === lesson.id ? null : current
                    )
                  }
                  onToggleFavorite={() => handleToggleFavorite(lesson.id)}
                  onRemove={() => handleRemove(lesson.id)}
                  onNavigate={() => router.push(`/lesson/${lesson.id}`)}
                  learnedCount={progress.learned}
                  totalCount={progress.total}
                  resumeMeta={resumeMap[lesson.id] ?? null}
                />
              );
            })
          )}
        </div>
      </main>

      <Toast toast={toast} onAction={handleAction} onClose={dismissToast} />
    </>
  );
}
