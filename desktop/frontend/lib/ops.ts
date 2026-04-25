// Pure functions for applying SegmentOp to a Segment[].
// No React. No side effects. Every function returns a new array.
// Correctness here is the single most important thing in M7.

import type { Lesson, Segment, SegmentOp } from "./types";
import { beatsBetween } from "./snap";
import { t2 } from "./utils";

// ---- id helpers -----------------------------------------------------------

/**
 * Next seg id in seg_XXX format. Continues past the current max numeric suffix
 * rather than re-using deleted ids, so a `split` of seg_017 in a lesson whose
 * last id is seg_017 yields seg_018 + seg_019 (matching spec §集成冲突高发区).
 */
export function nextSegId(existing: Segment[]): string {
  let max = -1;
  for (const s of existing) {
    const m = /^seg_(\d+)$/.exec(s.id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  const next = max + 1;
  return `seg_${String(next).padStart(3, "0")}`;
}

// ---- invariants -----------------------------------------------------------

function recalc(seg: Segment, beats: number[]): Segment {
  const start = t2(seg.start);
  const end = t2(seg.end);
  const duration = t2(end - start);
  const beat_count = beatsBetween(beats, start, end);
  return { ...seg, start, end, duration, beat_count };
}

/** Sort by start ascending and reassign `index` from 0. id is preserved. */
export function reindexSegments(segments: Segment[]): Segment[] {
  return [...segments]
    .sort((a, b) => a.start - b.start)
    .map((s, i) => (s.index === i ? s : { ...s, index: i }));
}

function bySortedStart(a: Segment, b: Segment) {
  return a.start - b.start;
}

function findSegIndex(segments: Segment[], id: string): number {
  return segments.findIndex((s) => s.id === id);
}

// ---- individual ops -------------------------------------------------------

/**
 * update — change bounds of a single segment.
 * Bounds are clamped so segment does not cross its neighbors or lesson edges.
 */
export function updateSegmentBounds(
  segments: Segment[],
  beats: number[],
  id: string,
  start: number,
  end: number,
  lessonDuration: number
): Segment[] {
  const idx = findSegIndex(segments, id);
  if (idx < 0) return segments;

  // Reject inverted or collapsed ranges up front — the UI should never
  // send these, and silently clamping would mask a caller bug.
  if (!(start < end)) return segments;

  const sorted = [...segments].sort(bySortedStart);
  const sortedIdx = sorted.findIndex((s) => s.id === id);
  const prev = sorted[sortedIdx - 1];
  const next = sorted[sortedIdx + 1];

  const minStart = prev ? prev.end : 0;
  const maxEnd = next ? next.start : lessonDuration;

  const ns = Math.max(minStart, Math.min(start, maxEnd - 0.01));
  const ne = Math.min(maxEnd, Math.max(end, ns + 0.01));
  if (ns >= ne) {
    return segments;
  }

  return reindexSegments(
    segments.map((s) =>
      s.id === id
        ? recalc(
            { ...s, start: ns, end: ne, user_edited: true },
            beats
          )
        : s
    )
  );
}

/**
 * merge — collapse a list of segment ids (must be contiguous after sort)
 * into a single segment. Keeps the id of the earliest-starting member so
 * learning state (which may key off segment id) is preserved for that one.
 */
export function mergeSegments(
  segments: Segment[],
  beats: number[],
  ids: string[]
): Segment[] {
  if (ids.length < 2) return segments;
  const targets = segments.filter((s) => ids.includes(s.id));
  if (targets.length !== ids.length) return segments;

  const sorted = [...targets].sort(bySortedStart);
  // contiguity check: after sort by start in full segment list,
  // their indices must be consecutive.
  const fullSorted = [...segments].sort(bySortedStart);
  const firstIdx = fullSorted.findIndex((s) => s.id === sorted[0].id);
  for (let k = 0; k < sorted.length; k++) {
    if (fullSorted[firstIdx + k]?.id !== sorted[k].id) {
      // not contiguous — silently no-op; caller should validate first
      return segments;
    }
  }

  const head = sorted[0];
  const tail = sorted[sorted.length - 1];
  const merged: Segment = recalc(
    {
      ...head,
      start: head.start,
      end: tail.end,
      // Pull teaching back into a pending state — content is now stale.
      teaching: head.teaching
        ? {
            ...head.teaching,
            status: "pending",
          }
        : null,
      user_edited: true,
    },
    beats
  );

  const removed = new Set(sorted.slice(1).map((s) => s.id));
  return reindexSegments(
    segments.filter((s) => !removed.has(s.id)).map((s) =>
      s.id === head.id ? merged : s
    )
  );
}

/**
 * split — cut a segment at time `at` into two segments.
 * First part keeps the original id; second part gets a fresh id.
 */
export function splitSegment(
  segments: Segment[],
  beats: number[],
  id: string,
  at: number
): Segment[] {
  const target = segments.find((s) => s.id === id);
  if (!target) return segments;
  if (at <= target.start + 0.01 || at >= target.end - 0.01) {
    return segments; // split point not strictly inside
  }

  const first: Segment = recalc(
    {
      ...target,
      end: at,
      user_edited: true,
      teaching: target.teaching
        ? { ...target.teaching, status: "pending" }
        : null,
    },
    beats
  );

  const newId = nextSegId(segments);
  const second: Segment = recalc(
    {
      ...target,
      id: newId,
      start: at,
      end: target.end,
      user_edited: true,
      // New segment has no teaching yet.
      teaching:
        target.teaching
          ? {
              status: "pending",
              summary: "",
              steps: [],
              tips: [],
              beat_cues: [],
              generated_at: "",
            }
          : null,
    },
    beats
  );

  const next = segments.flatMap((s) => (s.id === id ? [first, second] : [s]));
  return reindexSegments(next);
}

/**
 * delete — remove a segment. Pure client-side removal; backend may still
 * retain files for soft-delete semantics (PRD §8).
 */
export function deleteSegment(
  segments: Segment[],
  id: string
): Segment[] {
  return reindexSegments(segments.filter((s) => s.id !== id));
}

/**
 * create — insert a new segment spanning [start, end] in the given section.
 * Caller is responsible for snapping start/end and for supplying a valid
 * section id; we default a handful of fields so the result is a full Segment.
 */
export function createSegment(
  segments: Segment[],
  beats: number[],
  lessonId: string,
  start: number,
  end: number,
  section: string,
  sectionLabel = section
): Segment[] {
  if (end <= start) return segments;
  // reject if overlapping any existing segment
  for (const s of segments) {
    const overlap = !(end <= s.start + 0.01 || start >= s.end - 0.01);
    if (overlap) return segments;
  }
  const id = nextSegId(segments);
  const created: Segment = recalc(
    {
      id,
      lesson_id: lessonId,
      index: segments.length, // will be reassigned
      section,
      section_label: sectionLabel,
      start,
      end,
      duration: 0,
      beat_count: 0,
      thumbnail: "",
      clip_url: "",
      difficulty: 3,
      is_still: false,
      ai_description: "",
      user_edited: true,
      teaching: {
        status: "pending",
        summary: "",
        steps: [],
        tips: [],
        beat_cues: [],
        generated_at: "",
      },
    },
    beats
  );
  return reindexSegments([...segments, created]);
}

// ---- dispatcher -----------------------------------------------------------

export interface ApplyContext {
  beats: number[];
  lessonId: string;
  lessonDuration: number;
  sections: { id: string; label: string }[];
}

export function applyOp(
  segments: Segment[],
  op: SegmentOp,
  ctx: ApplyContext
): Segment[] {
  switch (op.op) {
    case "update":
      return updateSegmentBounds(
        segments,
        ctx.beats,
        op.id,
        op.start,
        op.end,
        ctx.lessonDuration
      );
    case "merge":
      return mergeSegments(segments, ctx.beats, op.ids);
    case "split":
      return splitSegment(segments, ctx.beats, op.id, op.at);
    case "delete":
      return deleteSegment(segments, op.id);
    case "create": {
      const sec = ctx.sections.find((s) => s.id === op.section);
      return createSegment(
        segments,
        ctx.beats,
        ctx.lessonId,
        op.start,
        op.end,
        op.section,
        sec?.label ?? op.section
      );
    }
  }
}

export function applyOps(
  segments: Segment[],
  ops: SegmentOp[],
  ctx: ApplyContext
): Segment[] {
  return ops.reduce((acc, op) => applyOp(acc, op, ctx), segments);
}

// ---- convenience helpers used by the hook ---------------------------------

/** Build a context from a Lesson. */
export function ctxFromLesson(lesson: Lesson): ApplyContext {
  return {
    beats: lesson.beats,
    lessonId: lesson.id,
    lessonDuration: lesson.duration,
    sections: lesson.sections.map((s) => ({ id: s.id, label: s.label })),
  };
}
