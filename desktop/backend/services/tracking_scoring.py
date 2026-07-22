from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from models import Lesson, TrackingResult, TrackingSegmentScore
from services.tracking_store import now_iso


SAMPLE_STEP = 4
RESIZE_SHAPE = (96, 96)


@dataclass
class MotionProfile:
    duration: float
    points: list[tuple[float, float]]


def build_tracking_result(
    *,
    result_id: str,
    lesson: Lesson,
    user_id: str,
    video_url: str,
    uploaded_video_path: Path,
) -> TrackingResult:
    learnable_segments = [segment for segment in lesson.segments if not segment.deleted and not segment.is_still]
    if not learnable_segments:
        return TrackingResult(
            id=result_id,
            lessonId=lesson.id,
            userId=user_id,
            createdAt=now_iso(),
            score=0,
            segmentScores=[],
            videoUrl=video_url,
        )

    user_profile = _motion_profile_for_video(uploaded_video_path)
    duration_ratio = _duration_ratio(user_profile.duration, lesson.duration)

    total_duration = sum(segment.duration for segment in learnable_segments) or 1.0
    segment_scores: list[TrackingSegmentScore] = []

    cumulative_ratio = 0.0
    for segment in learnable_segments:
        reference_profile = _motion_profile_for_video(_clip_path_from_segment_url(segment.clip_url))
        start_ratio = cumulative_ratio
        segment_ratio = segment.duration / total_duration
        cumulative_ratio += segment_ratio

        user_energy = _average_energy_between(user_profile, start_ratio, cumulative_ratio)
        reference_energy = _average_energy_between(reference_profile, 0.0, 1.0)
        energy_score = _energy_score(user_energy, reference_energy)
        timing_ms = int(round(abs(1 - duration_ratio) * segment.duration * 1000))

        combined = round(max(0, min(100, energy_score * 0.72 + duration_ratio * 100 * 0.28)))
        segment_scores.append(
            TrackingSegmentScore(
                segmentId=segment.id,
                score=combined,
                timingMs=timing_ms,
            )
        )

    weighted_total = round(
        sum(score.score * segment.duration for score, segment in zip(segment_scores, learnable_segments))
        / total_duration
    )

    return TrackingResult(
        id=result_id,
        lessonId=lesson.id,
        userId=user_id,
        createdAt=now_iso(),
        score=max(0, min(100, weighted_total)),
        segmentScores=segment_scores,
        videoUrl=video_url,
    )


def _clip_path_from_segment_url(clip_url: str) -> Path:
    # clip_url is a POSIX-style URL path (e.g. "/clips/lesson/seg.mp4").
    # Split on "/" and rejoin via Path so it resolves correctly on every OS
    # (the previous hardcoded replace("/", "\\") only worked on Windows and
    # broke teacher-clip lookup on macOS/Linux).
    parts = [p for p in clip_url.split("/") if p]
    return (Path(__file__).resolve().parent.parent / "data").joinpath(*parts).resolve()


def _motion_profile_for_video(video_path: Path) -> MotionProfile:
    import cv2

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / fps if frame_count > 0 and fps > 0 else 0.0

    points: list[tuple[float, float]] = []
    previous = None
    frame_index = 0

    while True:
        ok, frame = capture.read()
        if not ok:
            break

        if frame_index % SAMPLE_STEP == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            small = cv2.resize(gray, RESIZE_SHAPE, interpolation=cv2.INTER_AREA)
            if previous is not None:
                diff = cv2.absdiff(previous, small)
                energy = float(diff.mean()) / 255.0
                points.append((frame_index / fps, energy))
            previous = small
        frame_index += 1

    capture.release()
    return MotionProfile(duration=max(duration, frame_index / fps if fps > 0 else 0.0), points=points)


def _average_energy_between(profile: MotionProfile, start_ratio: float, end_ratio: float) -> float:
    if not profile.points or profile.duration <= 0:
        return 0.0
    start_time = profile.duration * max(0.0, min(start_ratio, 1.0))
    end_time = profile.duration * max(0.0, min(end_ratio, 1.0))
    if end_time <= start_time:
        return 0.0

    values = [energy for time, energy in profile.points if start_time <= time <= end_time]
    if not values:
        return 0.0
    return sum(values) / len(values)


def _duration_ratio(uploaded_duration: float, lesson_duration: float) -> float:
    if uploaded_duration <= 0 or lesson_duration <= 0:
        return 0.0
    ratio = min(uploaded_duration / lesson_duration, lesson_duration / uploaded_duration)
    return max(0.0, min(1.0, ratio))


def _energy_score(user_energy: float, reference_energy: float) -> float:
    if reference_energy <= 0.0001 and user_energy <= 0.0001:
        return 95.0
    baseline = max(reference_energy, 0.08)
    diff_ratio = abs(user_energy - reference_energy) / baseline
    return max(18.0, 100.0 - diff_ratio * 65.0)
