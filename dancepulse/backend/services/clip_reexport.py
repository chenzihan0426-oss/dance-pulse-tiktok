from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from models import Lesson, Segment, TeachingStatus


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
REPO_ROOT = BASE_DIR.parent


def _ensure_repo_root_path() -> None:
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))


def _video_path(lesson: Lesson) -> Path:
    rel = lesson.video_url.lstrip("/")
    if rel.startswith("videos/"):
        return DATA_DIR / rel
    return DATA_DIR / "videos" / Path(rel).name


def _segment_clip_path(segment: Segment) -> Path:
    rel = segment.clip_url.lstrip("/")
    if rel.startswith("clips/"):
        return DATA_DIR / rel
    return DATA_DIR / "clips" / Path(rel).name


def _segment_thumb_path(segment: Segment) -> Path:
    rel = segment.thumbnail.lstrip("/")
    if rel.startswith("thumbs/"):
        return DATA_DIR / rel
    return DATA_DIR / "thumbs" / Path(rel).name


def _lesson_thumb_path(lesson: Lesson) -> Path:
    rel = lesson.thumbnail.lstrip("/")
    if rel.startswith("thumbs/"):
        return DATA_DIR / rel
    return DATA_DIR / "thumbs" / Path(rel).name


def _asset_stem(lesson: Lesson, segment: Segment) -> str:
    return f"{lesson.id}_{segment.id}"


def _asset_paths(lesson: Lesson, segment: Segment) -> tuple[Path, Path]:
    stem = _asset_stem(lesson, segment)
    return DATA_DIR / "clips" / f"{stem}.mp4", DATA_DIR / "thumbs" / f"{stem}.jpg"


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _run_ffmpeg(args: list[str]) -> None:
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _fallback_reexport(lesson: Lesson, segment: Segment) -> Segment:
    source = _video_path(lesson)
    clip_dest, thumb_dest = _asset_paths(lesson, segment)
    _ensure_parent(clip_dest)
    _ensure_parent(thumb_dest)

    if not source.exists():
        clip_dest.write_bytes(b"")
        thumb_dest.write_bytes(b"")
        return segment.model_copy(
            update={
                "clip_url": f"/clips/{clip_dest.name}",
                "thumbnail": f"/thumbs/{thumb_dest.name}",
            }
        )

    duration = max(segment.end - segment.start, 0.0)

    if _ffmpeg_available() and duration > 0:
        _run_ffmpeg(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{segment.start:.3f}",
                "-i",
                str(source),
                "-t",
                f"{duration:.3f}",
                "-c",
                "copy",
                str(clip_dest),
            ]
        )
        _run_ffmpeg(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{segment.start:.3f}",
                "-i",
                str(source),
                "-frames:v",
                "1",
                str(thumb_dest),
            ]
        )
    else:
        shutil.copy2(source, clip_dest)
        lesson_thumb = _lesson_thumb_path(lesson)
        if lesson_thumb.exists():
            shutil.copy2(lesson_thumb, thumb_dest)
        else:
            thumb_dest.write_bytes(b"")

    return segment.model_copy(
        update={
            "clip_url": f"/clips/{clip_dest.name}",
            "thumbnail": f"/thumbs/{thumb_dest.name}",
        }
    )


def reexport_segment_clip_and_thumb(lesson: Lesson, segment: Segment) -> Segment:
    source = _video_path(lesson)
    if not source.exists():
        return _fallback_reexport(lesson, segment)

    try:
        asset_id = _asset_stem(lesson, segment)
        _ensure_repo_root_path()
        from pipeline import re_export_clip  # noqa: PLC0415

        clip_url, thumb_url = re_export_clip(
            str(source),
            asset_id,
            segment.start,
            segment.end,
        )
        return segment.model_copy(
            update={
                "clip_url": clip_url.replace("\\", "/"),
                "thumbnail": thumb_url.replace("\\", "/"),
            }
        )
    except Exception:
        return _fallback_reexport(lesson, segment)


def reexport_all_segments(lesson: Lesson) -> Lesson:
    updated = [reexport_segment_clip_and_thumb(lesson, segment) for segment in lesson.segments]
    return _sync_lesson_thumbnail(lesson.model_copy(update={"segments": updated}))


def _needs_reexport(segment: Segment) -> bool:
    if segment.user_edited:
        return True
    if segment.teaching.status in (TeachingStatus.PENDING, TeachingStatus.FAILED):
        return True
    return not _segment_clip_path(segment).exists()


def reexport_lesson_clips(lesson: Lesson) -> Lesson:
    updated = []
    for segment in lesson.segments:
        if _needs_reexport(segment):
            updated.append(reexport_segment_clip_and_thumb(lesson, segment))
        else:
            updated.append(segment)
    return _sync_lesson_thumbnail(lesson.model_copy(update={"segments": updated}))


def _sync_lesson_thumbnail(lesson: Lesson) -> Lesson:
    for segment in lesson.segments:
        if segment.thumbnail:
            return lesson.model_copy(update={"thumbnail": segment.thumbnail})
    return lesson
