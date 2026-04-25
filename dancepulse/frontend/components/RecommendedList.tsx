import { LessonCard } from "@/components/LessonCard";
import type { LessonListItem } from "@/lib/types";

export function RecommendedList({
  lessons,
  progressMap,
  resumeMap,
  loading,
  error,
}: {
  lessons: LessonListItem[];
  progressMap?: Record<string, { learned: number; total: number }>;
  resumeMap?: Record<string, { index: number; sectionLabel: string } | null>;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-[158px] animate-pulse rounded-[28px] bg-bg-surface"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[24px] border border-state-danger/20 bg-state-danger/10 px-4 py-5 text-sm text-red-200">
        推荐列表加载失败：{error}
      </div>
    );
  }

  if (lessons.length === 0) {
    return (
      <div className="rounded-[24px] bg-bg-surface px-4 py-5 text-sm text-white/45">
        暂时没有推荐课程，先去学习页看看全部内容吧。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lessons.map((lesson) => (
        <LessonCard
          key={lesson.id}
          lesson={lesson}
          learnedCount={progressMap?.[lesson.id]?.learned ?? 0}
          totalCount={progressMap?.[lesson.id]?.total ?? 0}
          resumeMeta={resumeMap?.[lesson.id] ?? null}
          variant="compact"
        />
      ))}
    </div>
  );
}
