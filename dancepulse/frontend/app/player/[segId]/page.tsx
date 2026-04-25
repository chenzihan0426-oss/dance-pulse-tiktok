"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { VerticalPlayer } from "@/components/player/VerticalPlayer";
import { TeachingSheet } from "@/components/player/TeachingSheet";
import { getSegmentContext, regenerateTeaching } from "@/lib/api";
import { setLastViewedSegmentId, setUserLessonState } from "@/lib/storage";
import type { Lesson } from "@/lib/types";
import { useLearningProgress } from "@/hooks/useLearningProgress";

export default function PlayerPage() {
  const params = useParams<{ segId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const segId = params?.segId ?? "";
  const lessonHint = searchParams?.get("lesson");
  const mode = searchParams?.get("mode") === "fullplay" ? "fullplay" : "study";

  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [regenerating, setRegenerating] = React.useState(false);
  const [teachingOpen, setTeachingOpen] = React.useState(false);
  const progress = useLearningProgress(lesson?.id ?? "");
  const { learnedIds, markLearned, setTotal } = progress;

  const loadSegmentContext = React.useCallback(
    () => getSegmentContext(segId, lessonHint),
    [lessonHint, segId]
  );

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await loadSegmentContext();
        if (!cancelled) {
          setLesson(data.lesson);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadSegmentContext]);

  React.useEffect(() => {
    if (!lesson) return;
    setTotal(lesson.segments.filter((segment) => !segment.is_still && !segment.deleted).length);
  }, [lesson, setTotal]);

  React.useEffect(() => {
    if (!lesson || !segId) return;
    setLastViewedSegmentId(lesson.id, segId);
    setUserLessonState(lesson.id, { lastStudiedAt: new Date().toISOString() });
  }, [lesson, segId]);

  const segment = React.useMemo(
    () => lesson?.segments.find((item) => item.id === segId) ?? null,
    [lesson, segId]
  );

  const activeSegments = React.useMemo(
    () => lesson?.segments.filter((item) => !item.deleted && !item.is_still) ?? [],
    [lesson]
  );

  React.useEffect(() => {
    if (!lesson) return;
    const currentIndex = activeSegments.findIndex((item) => item.id === segId);
    if (currentIndex < 0) return;

    const prevSegment = currentIndex > 0 ? activeSegments[currentIndex - 1] : null;
    const nextSegment =
      currentIndex < activeSegments.length - 1 ? activeSegments[currentIndex + 1] : null;

    if (prevSegment) {
      router.prefetch(`/player/${prevSegment.id}?lesson=${lesson.id}`);
    }
    if (nextSegment) {
      router.prefetch(`/player/${nextSegment.id}?lesson=${lesson.id}`);
    }
  }, [activeSegments, lesson, router, segId]);

  React.useEffect(() => {
    if (segment?.teaching?.status !== "pending") return;

    let cancelled = false;
    let timer = 0;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const data = await loadSegmentContext();
        if (cancelled) return;
        setLesson(data.lesson);
        if (data.segment.teaching?.status === "pending" && attempts < 18) {
          timer = window.setTimeout(poll, 2500);
        }
      } catch {
        if (!cancelled && attempts < 18) {
          timer = window.setTimeout(poll, 2500);
        }
      }
    };

    timer = window.setTimeout(poll, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadSegmentContext, segment?.teaching?.status]);

  const handleRegenerate = React.useCallback(async () => {
    if (!segment || !lesson) return;
    setRegenerating(true);
    try {
      await regenerateTeaching(lesson.id, segment.id);
      setLesson((current) =>
        current
          ? {
              ...current,
              segments: current.segments.map((item) =>
                item.id === segment.id
                  ? {
                      ...item,
                      teaching: item.teaching
                        ? { ...item.teaching, status: "pending" }
                        : {
                            status: "pending",
                            summary: item.ai_description,
                            steps: [],
                            tips: [],
                            beat_cues: [],
                            generated_at: "",
                          },
                    }
                  : item
              ),
            }
          : current
      );
    } finally {
      setRegenerating(false);
    }
  }, [lesson, segment]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-root px-5 text-white">
        <div className="rounded-[24px] border border-state-danger/20 bg-state-danger/10 px-5 py-5 text-sm text-red-200">
          播放器加载失败：{error}
        </div>
      </main>
    );
  }

  if (!lesson || !segment) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-root text-white">
        <div className="inline-flex items-center gap-3 text-sm text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载播放器...
        </div>
      </main>
    );
  }

  return (
    <>
      <VerticalPlayer
        lesson={lesson}
        segment={segment}
        practiceSegments={activeSegments}
        learnedIds={new Set(learnedIds)}
        mode={mode}
        onNavigate={(nextId) => router.push(`/player/${nextId}?lesson=${lesson.id}`)}
        onMarkLearned={markLearned}
        onOpenTeaching={() => setTeachingOpen(true)}
      />
      {mode === "study" ? (
        <TeachingSheet
          open={teachingOpen}
          onOpenChange={setTeachingOpen}
          onRegenerate={handleRegenerate}
          regenerating={regenerating}
          segment={segment}
        />
      ) : null}
    </>
  );
}
