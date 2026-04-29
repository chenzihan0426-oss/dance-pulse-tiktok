"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { SyncPromptCard } from "@/components/auth/SyncPromptCard";
import { FeaturedLessonCard } from "@/components/FeaturedLessonCard";
import { GreetingHeader } from "@/components/GreetingHeader";
import { RecommendedList } from "@/components/RecommendedList";
import { useAuth } from "@/hooks/useAuth";
import { useLessonsWithProgress } from "@/hooks/useLessonsWithProgress";
import { useUserLessonStates } from "@/hooks/useUserLessonStates";

const HOME_USER = {
  nickname: "Nova",
  streakDays: 7,
  greeting: "今天练 20 分钟后，继续巩固节奏",
};

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const { lessons, progressMap, resumeMap, loading, error } = useLessonsWithProgress();
  const [query, setQuery] = React.useState("");

  const lessonIds = React.useMemo(() => lessons.map((lesson) => lesson.id), [lessons]);
  const { enrolledLessons } = useUserLessonStates(lessonIds);
  const enrolledSet = React.useMemo(() => new Set(enrolledLessons), [enrolledLessons]);
  const visibleLessons = React.useMemo(
    () => lessons.filter((lesson) => enrolledSet.has(lesson.id)),
    [enrolledSet, lessons]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const searchResults = React.useMemo(() => {
    if (!isSearching) return [];

    return visibleLessons.filter((lesson) => {
      const statusText = [
        lesson.confirmed ? "已确认 confirmed" : "待确认 draft",
        lesson.demo_ready ? "demo 演示 已就绪" : "",
        lesson.has_video === false ? "缺视频 missing video" : "有视频 video",
      ].join(" ");

      return [lesson.title, `${lesson.bpm} bpm`, statusText].some((item) =>
        item.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [isSearching, normalizedQuery, visibleLessons]);

  const resumingLesson = React.useMemo(
    () =>
      visibleLessons.find((lesson) => {
        const progress = progressMap[lesson.id];
        return progress && progress.learned > 0 && progress.learned < progress.total;
      }) ??
      visibleLessons[0] ??
      null,
    [progressMap, visibleLessons]
  );

  const recommendedLessons = React.useMemo(() => {
    if (isSearching) return searchResults.slice(0, 6);
    return visibleLessons.filter((lesson) => lesson.id !== resumingLesson?.id).slice(0, 3);
  }, [isSearching, resumingLesson?.id, searchResults, visibleLessons]);

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-10 text-white">
      <GreetingHeader
        nickname={HOME_USER.nickname}
        subtitle={HOME_USER.greeting}
        streakDays={HOME_USER.streakDays}
      />

      {!isAuthenticated ? <SyncPromptCard variant="compact" /> : null}

      <label className="mt-7 flex h-14 w-full items-center gap-3 rounded-[20px] bg-bg-surface px-5 text-[15px] text-white transition focus-within:ring-2 focus-within:ring-brand/40">
        <Search className="h-5 w-5 shrink-0 text-white/35" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/40"
          placeholder="搜索舞曲 / BPM / 状态"
          aria-label="搜索课程"
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

      {!isSearching ? (
        <div className="mt-10">
          <FeaturedLessonCard
            lesson={resumingLesson}
            progress={resumingLesson ? progressMap[resumingLesson.id] : undefined}
            resumeMeta={resumingLesson ? resumeMap[resumingLesson.id] : null}
            loading={loading}
            error={error}
          />
        </div>
      ) : null}

      <section className={isSearching ? "mt-8" : "mt-10"}>
        <div className="mb-6">
          <h2 className="text-[22px] font-semibold tracking-tight text-white">
            {isSearching ? "搜索结果" : "为你推荐"}
          </h2>
          {isSearching ? (
            <p className="mt-1 text-[13px] text-white/40">
              {loading ? "正在搜索课程" : `找到 ${searchResults.length} 门课程`}
            </p>
          ) : null}
        </div>
        <RecommendedList
          lessons={recommendedLessons}
          progressMap={progressMap}
          resumeMap={resumeMap}
          loading={loading}
          error={error}
          emptyMessage={
            isSearching
              ? "没有找到匹配课程，换个舞曲名、BPM 或状态再试试。"
              : undefined
          }
        />
      </section>
    </main>
  );
}
