import { getLesson } from "@/lib/api";
import { getLastViewedSegmentId, getLearnedIds } from "@/lib/storage";
import type { LessonListItem } from "@/lib/types";

export type ProgressMap = Record<string, { learned: number; total: number }>;
export type ResumeMap = Record<string, { index: number; sectionLabel: string } | null>;

export async function buildLessonProgressMaps(
  lessons: LessonListItem[]
): Promise<{ progressMap: ProgressMap; resumeMap: ResumeMap }> {
  const entries = await Promise.all(
    lessons.map(async (lesson) => {
      const detail = await getLesson(lesson.id);
      const learnableSegments = detail.segments.filter(
        (segment) => !segment.is_still && !segment.deleted
      );
      const total = learnableSegments.length;
      const learnedIds = getLearnedIds(lesson.id);
      const learned = learnedIds.length;
      const learnedSet = new Set(learnedIds);
      const lastViewedSegmentId = getLastViewedSegmentId(lesson.id);
      const resumeSegment =
        (lastViewedSegmentId
          ? learnableSegments.find(
              (segment) => segment.id === lastViewedSegmentId && !learnedSet.has(segment.id)
            ) ?? null
          : null) ??
        learnableSegments.find((segment) => !learnedSet.has(segment.id)) ??
        null;
      const resumeIndex = resumeSegment
        ? learnableSegments.findIndex((segment) => segment.id === resumeSegment.id)
        : -1;

      return [
        lesson.id,
        {
          progress: { learned, total },
          resume:
            resumeSegment && resumeIndex >= 0
              ? {
                  index: resumeIndex,
                  sectionLabel: resumeSegment.section_label,
                }
              : null,
        },
      ] as const;
    })
  );

  return {
    progressMap: Object.fromEntries(entries.map(([lessonId, meta]) => [lessonId, meta.progress])),
    resumeMap: Object.fromEntries(entries.map(([lessonId, meta]) => [lessonId, meta.resume])),
  };
}
