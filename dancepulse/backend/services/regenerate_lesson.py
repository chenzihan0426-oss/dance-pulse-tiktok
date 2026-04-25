from __future__ import annotations

from dataclasses import dataclass

from models import Lesson, RegenerateLessonRequest, Section, Segment, Teaching, TeachingStatus
from services.beat_validator import round_time


@dataclass(frozen=True)
class SegmentSeed:
    start: float
    end: float
    difficulty: int
    is_still: bool
    ai_description: str
    clip_url: str
    thumbnail: str


def _beats_between(beats: list[float], start: float, end: float) -> int:
    count = 0
    for beat in beats:
        if beat < start - 0.01:
            continue
        if beat > end + 0.01:
            break
        count += 1
    return max(0, count - 1)


def _overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


def _build_sections(lesson: Lesson, use_section_detection: bool) -> list[Section]:
    if use_section_detection and lesson.sections:
        return lesson.sections
    return [
        Section(
            id="unknown",
            label="未分段",
            start=0.0,
            end=round_time(lesson.duration),
        )
    ]


def _find_section(sections: list[Section], at: float) -> Section:
    for section in sections:
        if section.start - 0.01 <= at < section.end + 0.01:
            return section
    return sections[0]


def _seed_from_existing(lesson: Lesson, start: float, end: float) -> SegmentSeed:
    overlaps: list[tuple[Segment, float]] = []
    for segment in lesson.segments:
        overlap = _overlap(start, end, segment.start, segment.end)
        if overlap > 0.01:
            overlaps.append((segment, overlap))

    if not overlaps:
        return SegmentSeed(
            start=start,
            end=end,
            difficulty=3,
            is_still=False,
            ai_description="重新切分后的动作片段",
            clip_url=lesson.video_url,
            thumbnail=lesson.thumbnail,
        )

    total = sum(weight for _, weight in overlaps)
    dominant = max(overlaps, key=lambda item: item[1])[0]
    weighted_difficulty = sum(item.difficulty * weight for item, weight in overlaps) / total
    still_weight = sum(weight for item, weight in overlaps if item.is_still)

    return SegmentSeed(
        start=start,
        end=end,
        difficulty=max(1, min(5, round(weighted_difficulty))),
        is_still=still_weight >= total * 0.5,
        ai_description=dominant.ai_description or "重新切分后的动作片段",
        clip_url=dominant.clip_url or lesson.video_url,
        thumbnail=dominant.thumbnail or lesson.thumbnail,
    )


def _build_segment_seeds(lesson: Lesson, payload: RegenerateLessonRequest) -> list[SegmentSeed]:
    beats = lesson.beats
    step = payload.granularity
    seeds: list[SegmentSeed] = []

    if len(beats) >= step + 1:
        index = 0
        while index + step < len(beats):
            start = round_time(beats[index])
            end = round_time(beats[index + step])
            seeds.append(_seed_from_existing(lesson, start, end))
            index += step
    elif len(beats) >= 2:
        seeds.append(_seed_from_existing(lesson, round_time(beats[0]), round_time(beats[-1])))

    if not seeds and lesson.segments:
        seeds = [
            SegmentSeed(
                start=segment.start,
                end=segment.end,
                difficulty=segment.difficulty,
                is_still=segment.is_still,
                ai_description=segment.ai_description,
                clip_url=segment.clip_url,
                thumbnail=segment.thumbnail,
            )
            for segment in lesson.segments
        ]

    return seeds


def _merge_still_seeds(seeds: list[SegmentSeed]) -> list[SegmentSeed]:
    if not seeds:
        return []

    merged: list[SegmentSeed] = []
    pending_start: float | None = None
    pending_end: float | None = None

    for seed in seeds:
        if seed.is_still:
            if pending_start is None:
                pending_start = seed.start
            pending_end = seed.end
            continue

        start = pending_start if pending_start is not None else seed.start
        merged.append(
            SegmentSeed(
                start=start,
                end=seed.end,
                difficulty=seed.difficulty,
                is_still=False,
                ai_description=seed.ai_description,
                clip_url=seed.clip_url,
                thumbnail=seed.thumbnail,
            )
        )
        pending_start = None
        pending_end = None

    if pending_start is not None:
        if merged:
            last = merged[-1]
            merged[-1] = SegmentSeed(
                start=last.start,
                end=pending_end or last.end,
                difficulty=last.difficulty,
                is_still=False,
                ai_description=last.ai_description,
                clip_url=last.clip_url,
                thumbnail=last.thumbnail,
            )
        else:
            only = seeds[0]
            merged.append(
                SegmentSeed(
                    start=pending_start,
                    end=pending_end or only.end,
                    difficulty=only.difficulty,
                    is_still=False,
                    ai_description=only.ai_description or "整段为静态/过渡动作",
                    clip_url=only.clip_url,
                    thumbnail=only.thumbnail,
                )
            )

    return merged


def _handle_still_segments(
    seeds: list[SegmentSeed],
    mode: str,
) -> list[SegmentSeed]:
    if mode == "mark":
        return seeds
    if mode == "merge":
        return _merge_still_seeds(seeds)

    filtered = [seed for seed in seeds if not seed.is_still]
    if filtered:
        return filtered
    return _merge_still_seeds(seeds)


def _materialize_segments(
    lesson: Lesson,
    sections: list[Section],
    seeds: list[SegmentSeed],
) -> list[Segment]:
    segments: list[Segment] = []
    ordered = sorted(seeds, key=lambda item: (item.start, item.end))

    for index, seed in enumerate(ordered):
        seg_id = f"seg_{index:03d}"
        section = _find_section(sections, (seed.start + seed.end) / 2)
        start = round_time(seed.start)
        end = round_time(seed.end)
        segments.append(
            Segment(
                id=seg_id,
                lesson_id=lesson.id,
                index=index,
                section=section.id,
                section_label=section.label,
                start=start,
                end=end,
                duration=round_time(end - start),
                beat_count=_beats_between(lesson.beats, start, end),
                thumbnail=seed.thumbnail or lesson.thumbnail,
                clip_url=seed.clip_url or lesson.video_url,
                difficulty=seed.difficulty,
                is_still=seed.is_still,
                ai_description=seed.ai_description,
                user_edited=False,
                teaching=Teaching(status=TeachingStatus.PENDING),
                deleted=False,
            )
        )

    return segments


def regenerate_lesson_segments(
    lesson: Lesson,
    payload: RegenerateLessonRequest,
) -> Lesson:
    sections = _build_sections(lesson, payload.section_detection)
    seeds = _build_segment_seeds(lesson, payload)
    seeds = _handle_still_segments(seeds, payload.still_handling)
    segments = _materialize_segments(lesson, sections, seeds)

    return lesson.model_copy(
        update={
            "sections": sections,
            "segments": segments,
            "confirmed": False,
        }
    )
