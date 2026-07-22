from __future__ import annotations

import json
import os
import threading
from pathlib import Path

from fastapi import HTTPException

from models import Lesson, LessonListItem, Segment


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
LESSONS_DIR = DATA_DIR / "lessons"


def list_lesson_files() -> list[Path]:
    return sorted(
        LESSONS_DIR.glob("*.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )


def get_lesson_path(lesson_id: str) -> Path:
    return LESSONS_DIR / f"{lesson_id}.json"


def load_lesson(lesson_id: str) -> Lesson:
    path = get_lesson_path(lesson_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Lesson not found")

    lesson = Lesson.model_validate_json(path.read_text(encoding="utf-8"))
    return _ensure_playable_lesson_video(_sync_lesson_thumbnail(lesson))


def save_lesson(lesson: Lesson) -> None:
    path = get_lesson_path(lesson.id)
    lesson = _sync_lesson_thumbnail(lesson)
    _atomic_write_json(path, json.dumps(lesson.model_dump(mode="json"), ensure_ascii=False, indent=2))


# ---------------------------------------------------------------------------
# 并发安全的单段更新
#   多个教学 worker 可并行跑 VLM(耗时部分),只在写盘瞬间用 per-lesson 锁
#   串行化"重读最新 → 只替换目标段 → 原子写回",避免读改写竞态互相覆盖。
# ---------------------------------------------------------------------------

_lesson_write_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(lesson_id: str) -> threading.Lock:
    with _locks_guard:
        lock = _lesson_write_locks.get(lesson_id)
        if lock is None:
            lock = threading.Lock()
            _lesson_write_locks[lesson_id] = lock
        return lock


def _atomic_write_json(path: Path, text: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)  # 原子替换,避免半写文件被读到


def update_segment(lesson_id: str, segment: Segment) -> None:
    """只更新某一段并写回,持 per-lesson 锁保证并发安全。

    锁内重新从磁盘读取整门课,合并其它 worker 已写入的进度,只替换目标段。
    """
    lock = _lock_for(lesson_id)
    with lock:
        path = get_lesson_path(lesson_id)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Lesson not found")
        current = Lesson.model_validate_json(path.read_text(encoding="utf-8"))
        merged = [segment if s.id == segment.id else s for s in current.segments]
        updated = _sync_lesson_thumbnail(current.model_copy(update={"segments": merged}))
        _atomic_write_json(
            path,
            json.dumps(updated.model_dump(mode="json"), ensure_ascii=False, indent=2),
        )


def list_lessons() -> list[LessonListItem]:
    items: list[LessonListItem] = []
    for path in list_lesson_files():
        lesson = _sync_lesson_thumbnail(Lesson.model_validate_json(path.read_text(encoding="utf-8")))
        segs = [s for s in lesson.segments if not s.deleted]
        demo_ready = bool(segs) and all(
            s.matte_rgb_url and s.matte_mask_url and s.particle_url and s.pose_full_url
            for s in segs
        )
        # 检查本地 video 文件是否存在
        has_video = _local_media_exists(lesson.video_url)
        items.append(
            LessonListItem(
                id=lesson.id,
                title=lesson.title,
                thumbnail=lesson.thumbnail,
                duration=lesson.duration,
                bpm=lesson.bpm,
                confirmed=lesson.confirmed,
                demo_ready=demo_ready,
                has_video=has_video,
            )
        )
    # demo ready 排最前, 其次 has_video, 最后其他
    items.sort(key=lambda x: (not x.demo_ready, not x.has_video, x.id))
    return items


def _sync_lesson_thumbnail(lesson: Lesson) -> Lesson:
    for segment in lesson.segments:
        if segment.thumbnail:
            return lesson.model_copy(update={"thumbnail": segment.thumbnail})
    return lesson


def _local_media_exists(url: str) -> bool:
    if not url:
        return False
    if url.startswith(("http://", "https://")):
        return True
    rel = url.split("?", 1)[0].lstrip("/")
    path = DATA_DIR / rel
    return path.is_file() and path.stat().st_size > 4096


def _ensure_playable_lesson_video(lesson: Lesson) -> Lesson:
    if _local_media_exists(lesson.video_url):
        return lesson
    for segment in lesson.segments:
        if segment.deleted:
            continue
        if _local_media_exists(segment.clip_url):
            return lesson.model_copy(update={"video_url": segment.clip_url})
    return lesson
