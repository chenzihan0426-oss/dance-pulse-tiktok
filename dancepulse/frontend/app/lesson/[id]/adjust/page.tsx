"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AdjustEditSheet } from "@/components/adjust/AdjustEditSheet";
import { AdjustOverview } from "@/components/adjust/AdjustOverview";
import { RegenerateDialog } from "@/components/RegenerateDialog";
import { getLesson, regenerateLesson } from "@/lib/api";
import { useSegmentEditor } from "@/hooks/useSegmentEditor";
import type { Lesson, RegeneratePayload, SegmentOp } from "@/lib/types";

function buildDirtySegmentIds(
  pendingOps: SegmentOp[],
  initialLesson: Lesson,
  workingSegmentIds: Set<string>
) {
  const dirtyIds = new Set<string>();
  for (const op of pendingOps) {
    if (op.op === "merge") {
      op.ids.forEach((id) => dirtyIds.add(id));
      continue;
    }
    if (op.op === "create") continue;
    dirtyIds.add(op.id);
  }

  const initialIds = new Set(initialLesson.segments.map((segment) => segment.id));
  for (const id of workingSegmentIds) {
    if (!initialIds.has(id)) {
      dirtyIds.add(id);
    }
  }

  return dirtyIds;
}

function findNearestBeatIndex(beats: number[], time: number) {
  if (!beats.length) return -1;
  let nearestIndex = 0;
  let nearestDistance = Math.abs(beats[0] - time);
  for (let index = 1; index < beats.length; index += 1) {
    const distance = Math.abs(beats[index] - time);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }
  return nearestIndex;
}

export default function AdjustPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const lessonId = params?.id ?? "antifragile_dp";

  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [activeSegId, setActiveSegId] = React.useState<string | null>(null);
  const [previewSegId, setPreviewSegId] = React.useState<string | null>(null);
  const [regenOpen, setRegenOpen] = React.useState(false);
  const [regenLoading, setRegenLoading] = React.useState(false);
  const [hintVisible, setHintVisible] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setLesson(null);

    (async () => {
      try {
        const detail = await getLesson(lessonId);
        if (!cancelled) {
          setLesson(detail);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem("dp_adjust_hint_seen");
    if (seen === "true") return;

    setHintVisible(true);
    const timer = window.setTimeout(() => {
      setHintVisible(false);
      window.localStorage.setItem("dp_adjust_hint_seen", "true");
    }, 8000);

    return () => window.clearTimeout(timer);
  }, []);

  const dismissHint = React.useCallback(() => {
    setHintVisible(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dp_adjust_hint_seen", "true");
    }
  }, []);

  const editor = useSegmentEditor({
    lesson: lesson ?? {
      id: lessonId,
      title: "",
      source_url: "",
      duration: 0,
      bpm: 0,
      video_url: "",
      thumbnail: "",
      confirmed: false,
      beats: [],
      sections: [],
      segments: [],
    },
    onCommitted: (nextLesson) => router.push(`/lesson/${nextLesson.id}`),
    onLessonChange: (nextLesson) => setLesson(nextLesson),
  });

  const activeSegment = React.useMemo(
    () =>
      activeSegId
        ? editor.workingSegments.find((segment) => segment.id === activeSegId) ?? null
        : null,
    [activeSegId, editor.workingSegments]
  );

  const previewSegment = React.useMemo(
    () =>
      previewSegId
        ? editor.workingSegments.find((segment) => segment.id === previewSegId) ?? null
        : null,
    [editor.workingSegments, previewSegId]
  );

  const dirtySegmentIds = React.useMemo(() => {
    if (!lesson) return new Set<string>();
    return buildDirtySegmentIds(
      editor.pendingOps,
      lesson,
      new Set(editor.workingSegments.map((segment) => segment.id))
    );
  }, [editor.pendingOps, editor.workingSegments, lesson]);

  const sortedSegments = React.useMemo(
    () => [...editor.workingSegments].sort((a, b) => a.start - b.start),
    [editor.workingSegments]
  );

  const beatStep = React.useCallback(
    (segmentId: string, which: "start" | "end", delta: -1 | 1) => {
      if (!lesson) return;
      const segment = editor.workingSegments.find((item) => item.id === segmentId);
      if (!segment) return;

      const currentTime = which === "start" ? segment.start : segment.end;
      const currentBeatIndex = findNearestBeatIndex(lesson.beats, currentTime);
      const nextBeatIndex = currentBeatIndex + delta;
      if (currentBeatIndex < 0 || nextBeatIndex < 0 || nextBeatIndex >= lesson.beats.length) {
        return;
      }

      const nextTime = lesson.beats[nextBeatIndex];
      if (which === "start") {
        editor.updateBounds(segmentId, nextTime, segment.end);
      } else {
        editor.updateBounds(segmentId, segment.start, nextTime);
      }
    },
    [editor, lesson]
  );

  const selectedIndex = activeSegment
    ? sortedSegments.findIndex((segment) => segment.id === activeSegment.id)
    : -1;
  const prevSegment = selectedIndex > 0 ? sortedSegments[selectedIndex - 1] : null;
  const nextSegment =
    selectedIndex >= 0 && selectedIndex < sortedSegments.length - 1
      ? sortedSegments[selectedIndex + 1]
      : null;

  const canStartMinus = Boolean(
    activeSegment &&
      lesson?.beats.length &&
      findNearestBeatIndex(lesson.beats, activeSegment.start) > 0 &&
      (!prevSegment ||
        lesson.beats[findNearestBeatIndex(lesson.beats, activeSegment.start) - 1] <
          prevSegment.end)
  );
  const canStartPlus = Boolean(
    activeSegment &&
      lesson?.beats.length &&
      findNearestBeatIndex(lesson.beats, activeSegment.start) < lesson.beats.length - 1 &&
      lesson.beats[findNearestBeatIndex(lesson.beats, activeSegment.start) + 1] <
        activeSegment.end
  );
  const canEndMinus = Boolean(
    activeSegment &&
      lesson?.beats.length &&
      findNearestBeatIndex(lesson.beats, activeSegment.end) > 0 &&
      lesson.beats[findNearestBeatIndex(lesson.beats, activeSegment.end) - 1] >
        activeSegment.start
  );
  const canEndPlus = Boolean(
    activeSegment &&
      lesson?.beats.length &&
      findNearestBeatIndex(lesson.beats, activeSegment.end) < lesson.beats.length - 1 &&
      (!nextSegment ||
        lesson.beats[findNearestBeatIndex(lesson.beats, activeSegment.end) + 1] <
          nextSegment.start)
  );

  const handleSplitMiddle = React.useCallback(() => {
    if (!activeSegment) return;
    editor.splitAt(activeSegment.id, (activeSegment.start + activeSegment.end) / 2);
  }, [activeSegment, editor]);

  const handleDelete = React.useCallback(() => {
    if (!activeSegment) return;
    editor.deleteSegment(activeSegment.id);
    setActiveSegId(null);
  }, [activeSegment, editor]);

  const handleMergePrev = React.useCallback(() => {
    if (!activeSegment || !prevSegment) return;
    editor.mergePrev(activeSegment.id);
    setActiveSegId(prevSegment.id);
  }, [activeSegment, editor, prevSegment]);

  const handleRegenerate = React.useCallback(
    async (payload: RegeneratePayload) => {
      if (!lesson) return;
      setRegenLoading(true);
      try {
        const nextLesson = await regenerateLesson(lesson.id, payload);
        setLesson(nextLesson);
        setPreviewSegId(null);
        setRegenOpen(false);
      } finally {
        setRegenLoading(false);
      }
    },
    [lesson]
  );

  if (loadError) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-10 text-white">
        <div className="rounded-[24px] border border-state-danger/20 bg-state-danger/10 px-5 py-5 text-sm text-red-200">
          调整分段页加载失败：{loadError}
        </div>
      </main>
    );
  }

  if (!lesson) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-10 text-white">
        <div className="h-48 animate-pulse rounded-[28px] bg-bg-raised" />
      </main>
    );
  }

  return (
    <>
      <AdjustOverview
        lesson={lesson}
        segments={sortedSegments}
        previewSegment={previewSegment}
        dirtySegmentIds={dirtySegmentIds}
        pendingCount={editor.pendingOps.length}
        hintVisible={hintVisible}
        onDismissHint={dismissHint}
        onSelect={setActiveSegId}
        onUndo={editor.undo}
        onCommit={editor.commit}
        onRegenerate={() => setRegenOpen(true)}
        commitState={editor.commitState}
        commitError={editor.commitError}
      />

      <AdjustEditSheet
        open={Boolean(activeSegId)}
        onClose={() => setActiveSegId(null)}
        segment={activeSegment}
        canMergePrev={Boolean(prevSegment && activeSegment)}
        canMergeNext={Boolean(nextSegment && activeSegment)}
        canStartMinus={canStartMinus}
        canStartPlus={canStartPlus}
        canEndMinus={canEndMinus}
        canEndPlus={canEndPlus}
        onStartMinus={() => activeSegment && beatStep(activeSegment.id, "start", -1)}
        onStartPlus={() => activeSegment && beatStep(activeSegment.id, "start", 1)}
        onEndMinus={() => activeSegment && beatStep(activeSegment.id, "end", -1)}
        onEndPlus={() => activeSegment && beatStep(activeSegment.id, "end", 1)}
        onMergePrev={handleMergePrev}
        onMergeNext={() => activeSegment && editor.mergeNext(activeSegment.id)}
        onSplitMiddle={handleSplitMiddle}
        onDelete={handleDelete}
        onPreview={() => {
          if (activeSegment) {
            setPreviewSegId(activeSegment.id);
          }
        }}
      />

      <RegenerateDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        onSubmit={handleRegenerate}
        submitting={regenLoading}
      />
    </>
  );
}
