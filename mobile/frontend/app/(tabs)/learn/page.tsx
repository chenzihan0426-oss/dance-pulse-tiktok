"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { SyncPromptCard } from "@/components/auth/SyncPromptCard";
import { SwipeableLessonRow } from "@/components/SwipeableLessonRow";
import { Toast } from "@/components/ui/Toast";
import { getLessons } from "@/lib/api";
import { buildLessonProgressMaps, type ProgressMap, type ResumeMap } from "@/lib/lesson-progress";
import { PROGRESS_UPDATED_EVENT } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { useUserLessonStates } from "@/hooks/useUserLessonStates";
import type { LessonListItem } from "@/lib/types";

export default function LearnPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { toast, showToast, dismissToast, handleAction } = useToast();
  const [lessons, setLessons] = React.useState<LessonListItem[]>([]);
  const [progressMap, setProgressMap] = React.useState<ProgressMap>({});
  const [resumeMap, setResumeMap] = React.useState<ResumeMap>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [openRowId, setOpenRowId] = React.useState<string | null>(null);

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
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    const onProgressUpdated = () => {
      void load();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };

    window.addEventListener(PROGRESS_UPDATED_EVENT, onProgressUpdated as EventListener);
    window.addEventListener("focus", onProgressUpdated);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener(PROGRESS_UPDATED_EVENT, onProgressUpdated as EventListener);
      window.removeEventListener("focus", onProgressUpdated);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

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
        // DEMO 就绪优先
        if ((a.demo_ready ?? false) !== (b.demo_ready ?? false)) {
          return a.demo_ready ? -1 : 1;
        }
        // 有视频的排在没视频的前面
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

  React.useEffect(() => {
    sortedLessons.slice(0, 3).forEach((lesson) => {
      router.prefetch(`/lesson/${lesson.id}`);
    });
  }, [router, sortedLessons]);

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
          <div>
            <p className="text-[13px] text-white/45">你的课程库</p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-white">
              学习
            </h1>
          </div>

          <Link
            href="/import"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white transition hover:brightness-110"
            aria-label="导入课程"
          >
            <Plus className="h-5 w-5" />
          </Link>
        </div>

        <p className="mt-3 text-[14px] leading-6 text-white/45">
          继续最近的舞蹈，或者导入新的编舞开始练习。
        </p>

        {!isAuthenticated ? <SyncPromptCard /> : null}

        <div className="mt-8 space-y-4">
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
          ) : (
            sortedLessons.map((lesson) => {
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
