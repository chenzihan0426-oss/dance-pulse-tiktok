"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lesson, Segment, SegmentOp } from "@/lib/types";
import { applyOp, applyOps, ctxFromLesson } from "@/lib/ops";
import { snapToBeat } from "@/lib/snap";
import { t2 } from "@/lib/utils";
import { confirmLesson, patchSegments } from "@/lib/api";

interface UseSegmentEditorOptions {
  lesson: Lesson;
  /** Called after both PATCH + confirm succeed. Typically router.push. */
  onCommitted?: (lesson: Lesson) => void;
  /** Called whenever the server returns an updated lesson (e.g. after regenerate) */
  onLessonChange?: (lesson: Lesson) => void;
}

export interface SegmentEditorApi {
  // state
  lesson: Lesson;
  workingSegments: Segment[];
  selectedSegId: string | null;
  selectedSegment: Segment | null;
  pendingOps: SegmentOp[];
  isDirty: boolean;
  commitState: "idle" | "committing" | "error";
  commitError: string | null;

  // selection / preview
  selectSegment: (id: string | null) => void;

  // operations (each pushes an op and updates working state)
  updateBounds: (id: string, start: number, end: number) => void;
  mergePrev: (id: string) => void;
  mergeNext: (id: string) => void;
  splitAt: (id: string, at: number) => void;
  deleteSegment: (id: string) => void;
  createSegment: (start: number, end: number, section: string) => void;

  // undo / reset
  undo: () => void;
  reset: () => void;

  // commit
  commit: () => Promise<void>;
}

export function useSegmentEditor(
  options: UseSegmentEditorOptions
): SegmentEditorApi {
  const { lesson: initialLesson, onCommitted, onLessonChange } = options;

  const [lesson, setLesson] = useState<Lesson>(initialLesson);
  const [pendingOps, setPendingOps] = useState<SegmentOp[]>([]);
  const [selectedSegId, setSelectedSegId] = useState<string | null>(
    initialLesson.segments[0]?.id ?? null
  );
  const [commitState, setCommitState] = useState<
    "idle" | "committing" | "error"
  >("idle");
  const [commitError, setCommitError] = useState<string | null>(null);

  useEffect(() => {
    setLesson(initialLesson);
    setPendingOps([]);
    setSelectedSegId(initialLesson.segments[0]?.id ?? null);
    setCommitState("idle");
    setCommitError(null);
  }, [initialLesson]);

  const ctx = useMemo(() => ctxFromLesson(lesson), [lesson]);

  const workingSegments = useMemo(
    () => applyOps(lesson.segments, pendingOps, ctx),
    [lesson.segments, pendingOps, ctx]
  );

  const selectedSegment = useMemo(
    () =>
      selectedSegId
        ? workingSegments.find((s) => s.id === selectedSegId) ?? null
        : null,
    [workingSegments, selectedSegId]
  );

  // ----- helpers -----------------------------------------------------------

  const pushOp = useCallback(
    (op: SegmentOp) => {
      // Validate by dry-running applyOp. If it's a no-op (identity), discard
      // — keeps pendingOps free of garbage from invalid UI attempts.
      const before = workingSegments;
      const after = applyOp(before, op, ctx);
      if (after === before || shallowSegmentsEqual(before, after)) {
        return; // silently drop — caller's UI should have prevented this
      }
      setPendingOps((prev) => [...prev, op]);
    },
    [workingSegments, ctx]
  );

  // ----- selection --------------------------------------------------------

  const selectSegment = useCallback((id: string | null) => {
    setSelectedSegId(id);
  }, []);

  // ----- ops --------------------------------------------------------------

  const updateBounds = useCallback(
    (id: string, start: number, end: number) => {
      const snappedStart = snapToBeat(start, lesson.beats);
      const snappedEnd = snapToBeat(end, lesson.beats);
      pushOp({
        op: "update",
        id,
        start: t2(snappedStart),
        end: t2(snappedEnd),
      });
    },
    [lesson.beats, pushOp]
  );

  const mergePrev = useCallback(
    (id: string) => {
      const sorted = [...workingSegments].sort((a, b) => a.start - b.start);
      const idx = sorted.findIndex((s) => s.id === id);
      if (idx <= 0) return;
      const prev = sorted[idx - 1];
      pushOp({ op: "merge", ids: [prev.id, id] });
      setSelectedSegId(prev.id);
    },
    [workingSegments, pushOp]
  );

  const mergeNext = useCallback(
    (id: string) => {
      const sorted = [...workingSegments].sort((a, b) => a.start - b.start);
      const idx = sorted.findIndex((s) => s.id === id);
      if (idx < 0 || idx >= sorted.length - 1) return;
      const next = sorted[idx + 1];
      pushOp({ op: "merge", ids: [id, next.id] });
      // Selection stays on the head (id), which survives the merge.
    },
    [workingSegments, pushOp]
  );

  const splitAt = useCallback(
    (id: string, at: number) => {
      const snapped = snapToBeat(at, lesson.beats);
      pushOp({ op: "split", id, at: t2(snapped) });
    },
    [lesson.beats, pushOp]
  );

  const deleteSeg = useCallback(
    (id: string) => {
      pushOp({ op: "delete", id });
      if (selectedSegId === id) setSelectedSegId(null);
    },
    [selectedSegId, pushOp]
  );

  const createSeg = useCallback(
    (start: number, end: number, section: string) => {
      const snappedStart = snapToBeat(start, lesson.beats);
      const snappedEnd = snapToBeat(end, lesson.beats);
      pushOp({
        op: "create",
        start: t2(snappedStart),
        end: t2(snappedEnd),
        section,
      });
    },
    [lesson.beats, pushOp]
  );

  // ----- undo / reset -----------------------------------------------------

  const undo = useCallback(() => {
    setPendingOps((prev) => prev.slice(0, -1));
  }, []);

  const reset = useCallback(() => {
    setPendingOps([]);
  }, []);

  // ----- commit -----------------------------------------------------------

  const commit = useCallback(async () => {
    setCommitState("committing");
    setCommitError(null);
    try {
      let next = lesson;
      if (pendingOps.length > 0) {
        next = await patchSegments(lesson.id, pendingOps);
        setLesson(next);
        onLessonChange?.(next);
      }
      const confirmed = await confirmLesson(lesson.id);
      setLesson(confirmed);
      onLessonChange?.(confirmed);
      setPendingOps([]);
      setCommitState("idle");
      onCommitted?.(confirmed);
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : String(e));
      setCommitState("error");
    }
  }, [lesson, pendingOps, onCommitted, onLessonChange]);

  return {
    lesson,
    workingSegments,
    selectedSegId,
    selectedSegment,
    pendingOps,
    isDirty: pendingOps.length > 0,
    commitState,
    commitError,
    selectSegment,
    updateBounds,
    mergePrev,
    mergeNext,
    splitAt,
    deleteSegment: deleteSeg,
    createSegment: createSeg,
    undo,
    reset,
    commit,
  };
}

// Shallow-ish equality — enough to detect a no-op apply.
function shallowSegmentsEqual(a: Segment[], b: Segment[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.start !== y.start ||
      x.end !== y.end ||
      x.section !== y.section
    ) {
      return false;
    }
  }
  return true;
}
