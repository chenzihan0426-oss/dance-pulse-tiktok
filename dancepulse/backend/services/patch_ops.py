from __future__ import annotations

from collections.abc import Iterable

from models import CreateOp, Lesson, MergeOp, PatchOp, Segment, SplitOp, Teaching, TeachingStatus, UpdateOp
from services.beat_validator import round_time, validate_on_beat


def _segment_sort_key(segment: Segment) -> tuple[float, int]:
    return (segment.start, segment.index)


def _build_section_label(lesson: Lesson, section_id: str) -> str:
    for section in lesson.sections:
        if section.id == section_id:
            return section.label
    return section_id


def _next_segment_id(segments: Iterable[Segment]) -> str:
    max_num = -1
    for segment in segments:
        try:
            max_num = max(max_num, int(segment.id.split("_")[1]))
        except (IndexError, ValueError):
            continue
    return f"seg_{max_num + 1:03d}"


def _mark_pending(segment: Segment) -> Segment:
    return segment.model_copy(
        update={
            "user_edited": True,
            "teaching": segment.teaching.model_copy(update={"status": TeachingStatus.PENDING}),
        }
    )


def _beats_between(beats: list[float], start: float, end: float) -> int:
    count = 0
    for beat in beats:
        if beat < start - 0.01:
            continue
        if beat > end + 0.01:
            break
        count += 1
    return max(0, count - 1)


def _recalc_segment(segment: Segment, beats: list[float]) -> Segment:
    start = round_time(segment.start)
    end = round_time(segment.end)
    return segment.model_copy(
        update={
            "start": start,
            "end": end,
            "duration": round_time(end - start),
            "beat_count": _beats_between(beats, start, end),
        }
    )


def _reindex(segments: list[Segment]) -> list[Segment]:
    ordered = sorted(segments, key=_segment_sort_key)
    return [
        segment.model_copy(update={"index": idx, "duration": round_time(segment.end - segment.start)})
        for idx, segment in enumerate(ordered)
    ]


def _ensure_no_overlap(segments: list[Segment]) -> None:
    ordered = sorted(segments, key=_segment_sort_key)
    for prev, current in zip(ordered, ordered[1:]):
        if current.start < prev.end:
            raise ValueError("Segments cannot overlap")


def _find_index(segments: list[Segment], segment_id: str) -> int:
    for idx, segment in enumerate(segments):
        if segment.id == segment_id:
            return idx
    raise ValueError(f"Segment not found: {segment_id}")


def _validate_range(start: float, end: float, beats: list[float]) -> tuple[float, float]:
    start = round_time(start)
    end = round_time(end)
    if start >= end:
        raise ValueError("start must be less than end")
    validate_on_beat(start, beats, "start")
    validate_on_beat(end, beats, "end")
    return start, end


def _apply_update(lesson: Lesson, segments: list[Segment], op: UpdateOp) -> list[Segment]:
    idx = _find_index(segments, op.id)
    start, end = _validate_range(op.start, op.end, lesson.beats)
    updated = _recalc_segment(
        _mark_pending(
            segments[idx].model_copy(
                update={
                    "start": start,
                    "end": end,
                }
            )
        ),
        lesson.beats,
    )
    next_segments = segments.copy()
    next_segments[idx] = updated
    _ensure_no_overlap(next_segments)
    return _reindex(next_segments)


def _apply_merge(lesson: Lesson, segments: list[Segment], op: MergeOp) -> list[Segment]:
    if len(op.ids) != 2:
        raise ValueError("merge requires exactly two segment ids")

    first_idx = _find_index(segments, op.ids[0])
    second_idx = _find_index(segments, op.ids[1])
    ordered_indexes = sorted([first_idx, second_idx])
    if ordered_indexes[1] - ordered_indexes[0] != 1:
        raise ValueError("merge requires adjacent segments")

    first = segments[ordered_indexes[0]]
    second = segments[ordered_indexes[1]]
    merged = _recalc_segment(
        _mark_pending(
            first.model_copy(
                update={
                    "start": min(first.start, second.start),
                    "end": max(first.end, second.end),
                }
            )
        ),
        lesson.beats,
    )
    next_segments = segments.copy()
    next_segments[ordered_indexes[0]] = merged
    del next_segments[ordered_indexes[1]]
    _ensure_no_overlap(next_segments)
    return _reindex(next_segments)


def _apply_split(lesson: Lesson, segments: list[Segment], op: SplitOp) -> list[Segment]:
    idx = _find_index(segments, op.id)
    original = segments[idx]
    split_at = round_time(op.at)
    validate_on_beat(split_at, lesson.beats, "at")
    if split_at <= original.start or split_at >= original.end:
        raise ValueError("split point must be inside segment range")

    right_id = _next_segment_id(segments)
    left = _recalc_segment(
        _mark_pending(
            original.model_copy(
                update={
                    "start": original.start,
                    "end": split_at,
                }
            )
        ),
        lesson.beats,
    )
    right = _recalc_segment(
        _mark_pending(
            original.model_copy(
                update={
                    "id": right_id,
                    "start": split_at,
                    "end": original.end,
                    "thumbnail": f"/thumbs/{right_id}.jpg",
                    "clip_url": f"/clips/{right_id}.mp4",
                    "teaching": Teaching(status=TeachingStatus.PENDING),
                }
            )
        ),
        lesson.beats,
    )
    next_segments = segments.copy()
    next_segments[idx : idx + 1] = [left, right]
    _ensure_no_overlap(next_segments)
    return _reindex(next_segments)


def _apply_delete(segments: list[Segment], segment_id: str) -> list[Segment]:
    idx = _find_index(segments, segment_id)
    next_segments = segments.copy()
    del next_segments[idx]
    return _reindex(next_segments)


def _apply_create(lesson: Lesson, segments: list[Segment], op: CreateOp) -> list[Segment]:
    start, end = _validate_range(op.start, op.end, lesson.beats)
    segment_id = _next_segment_id(segments)
    created = _recalc_segment(
        Segment(
            id=segment_id,
            lesson_id=lesson.id,
            index=len(segments),
            section=op.section,
            section_label=_build_section_label(lesson, op.section),
            start=start,
            end=end,
            duration=round_time(end - start),
            beat_count=0,
            thumbnail=f"/thumbs/{segment_id}.jpg",
            clip_url=f"/clips/{segment_id}.mp4",
            difficulty=3,
            is_still=False,
            ai_description="用户新建切片",
            user_edited=True,
            teaching=Teaching(status=TeachingStatus.PENDING),
        ),
        lesson.beats,
    )
    next_segments = segments + [created]
    _ensure_no_overlap(next_segments)
    return _reindex(next_segments)


def apply_patch_ops(lesson: Lesson, ops: list[PatchOp]) -> Lesson:
    segments = lesson.segments
    for op in ops:
        if op.op == "update":
            segments = _apply_update(lesson, segments, op)
        elif op.op == "merge":
            segments = _apply_merge(lesson, segments, op)
        elif op.op == "split":
            segments = _apply_split(lesson, segments, op)
        elif op.op == "delete":
            segments = _apply_delete(segments, op.id)
        elif op.op == "create":
            segments = _apply_create(lesson, segments, op)
        else:
            raise ValueError(f"Unsupported op: {op.op}")

    return lesson.model_copy(update={"segments": segments, "confirmed": False})
