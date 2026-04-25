"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { SyncPromptCard } from "@/components/auth/SyncPromptCard";
import { FeaturedLessonCard } from "@/components/FeaturedLessonCard";
import { GreetingHeader } from "@/components/GreetingHeader";
import { RecommendedList } from "@/components/RecommendedList";
import { getLessons } from "@/lib/api";
import { buildLessonProgressMaps, type ProgressMap, type ResumeMap } from "@/lib/lesson-progress";
import { PROGRESS_UPDATED_EVENT } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { useUserLessonStates } from "@/hooks/useUserLessonStates";
import type { LessonListItem } from "@/lib/types";

const HOME_USER = {
  nickname: "Nova",
  streakDays: 7,
  greeting: "今天练 20 分钟吧",
};

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const [lessons, setLessons] = React.useState<LessonListItem[]>([]);
  const [progressMap, setProgressMap] = React.useState<ProgressMap>({});
  const [resumeMap, setResumeMap] = React.useState<ResumeMap>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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
  const { enrolledLessons } = useUserLessonStates(lessonIds);
  const enrolledSet = React.useMemo(() => new Set(enrolledLessons), [enrolledLessons]);
  const visibleLessons = React.useMemo(
    () => lessons.filter((lesson) => enrolledSet.has(lesson.id)),
    [enrolledSet, lessons]
  );

  const resumingLesson =
    visibleLessons.find((lesson) => {
      const progress = progressMap[lesson.id];
      return progress && progress.learned > 0 && progress.learned < progress.total;
    }) ?? visibleLessons[0] ?? null;

  const recommendedLessons = visibleLessons
    .filter((lesson) => lesson.id !== resumingLesson?.id)
    .slice(0, 3);

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-10 text-white">
      <GreetingHeader
        nickname={HOME_USER.nickname}
        subtitle={HOME_USER.greeting}
        streakDays={HOME_USER.streakDays}
      />

      {!isAuthenticated ? <SyncPromptCard /> : null}

      <button
        type="button"
        className="mt-8 flex h-14 w-full items-center gap-3 rounded-[20px] bg-bg-surface px-5 text-left text-[15px] text-white/40 transition hover:bg-white/[0.08]"
      >
        <Search className="h-5 w-5 text-white/35" />
        <span>搜索舞曲 / 歌手</span>
      </button>

      <div className="mt-10">
        <FeaturedLessonCard
          lesson={resumingLesson}
          progress={resumingLesson ? progressMap[resumingLesson.id] : undefined}
          resumeMeta={resumingLesson ? resumeMap[resumingLesson.id] : null}
          loading={loading}
          error={error}
        />
      </div>

      <section className="mt-10">
        <div className="mb-6">
          <h2 className="text-[22px] font-semibold tracking-tight text-white">
            为你推荐
          </h2>
        </div>
        <RecommendedList
          lessons={recommendedLessons}
          progressMap={progressMap}
          resumeMap={resumeMap}
          loading={loading}
          error={error}
        />
      </section>
    </main>
  );
}
