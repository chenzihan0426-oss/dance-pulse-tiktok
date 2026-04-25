from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

from models import Teaching, TeachingStatus
from services.clip_reexport import reexport_segment_clip_and_thumb
from services.lesson_store import list_lesson_files, load_lesson, save_lesson
from services.teaching_cues import build_null_beat_cues


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_DATA_DIR = REPO_ROOT / "backend" / "data"
logger = logging.getLogger(__name__)
_TEACHING_MAX_RETRIES = 3


def _ensure_repo_root_path() -> None:
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))


def _clip_path_for_segment(clip_url: str) -> Path:
    rel = clip_url.lstrip("/")
    return (BACKEND_DATA_DIR / rel).resolve()


def _teaching_worker_count() -> int:
    raw_value = os.getenv("TEACHING_QUEUE_WORKERS", "2").strip()
    try:
        worker_count = int(raw_value)
    except ValueError:
        worker_count = 2
    return max(1, min(3, worker_count))


class TeachingQueue:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[tuple[str, list[str]]] = asyncio.Queue()
        self._worker_tasks: list[asyncio.Task[None]] = []
        self._worker_count = _teaching_worker_count()
        self._lesson_locks: dict[str, asyncio.Lock] = {}

    async def start(self) -> None:
        if not self._worker_tasks:
            self._worker_tasks = [
                asyncio.create_task(self._worker(index), name=f"teaching-queue-worker-{index + 1}")
                for index in range(self._worker_count)
            ]
            logger.info("Teaching queue started with %d worker(s)", self._worker_count)
            await self._recover_incomplete_segments()

    async def enqueue(self, lesson_id: str, segment_ids: list[str]) -> None:
        if segment_ids:
            await self._queue.put((lesson_id, segment_ids))

    async def _recover_incomplete_segments(self) -> None:
        recovered = 0
        for lesson_file in list_lesson_files():
            lesson = load_lesson(lesson_file.stem)
            retry_ids = [
                segment.id
                for segment in lesson.segments
                if segment.teaching.status == TeachingStatus.PENDING
            ]
            if not retry_ids:
                continue
            await self.enqueue(lesson.id, retry_ids)
            recovered += len(retry_ids)
            logger.info(
                "Recovered %d incomplete teaching task(s) for lesson %s",
                len(retry_ids),
                lesson.id,
            )

        if recovered:
            logger.info("Recovered %d incomplete teaching task(s) in total", recovered)

    def _lock_for_lesson(self, lesson_id: str) -> asyncio.Lock:
        lock = self._lesson_locks.get(lesson_id)
        if lock is None:
            lock = asyncio.Lock()
            self._lesson_locks[lesson_id] = lock
        return lock

    async def _worker(self, worker_index: int) -> None:
        while True:
            lesson_id, segment_ids = await self._queue.get()
            try:
                async with self._lock_for_lesson(lesson_id):
                    logger.debug(
                        "Worker %d processing lesson=%s segments=%s",
                        worker_index + 1,
                        lesson_id,
                        ",".join(segment_ids),
                    )
                    await self._process(lesson_id, segment_ids)
            finally:
                self._queue.task_done()

    async def _process(self, lesson_id: str, segment_ids: list[str]) -> None:
        _ensure_repo_root_path()
        from teaching.generate_teaching import generate_teaching_for_segment  # noqa: PLC0415

        lesson = load_lesson(lesson_id)
        updated_segments = []

        for segment in lesson.segments:
            if segment.id not in segment_ids:
                updated_segments.append(segment)
                continue

            prepared_segment = segment
            if _needs_reexport_for_teaching(lesson.id, segment):
                prepared_segment = reexport_segment_clip_and_thumb(lesson, segment)

            try:
                teaching = await self._generate_teaching_with_retry(
                    lesson,
                    prepared_segment,
                    generate_teaching_for_segment,
                )
                updated_segments.append(prepared_segment.model_copy(update={"teaching": teaching}))
            except Exception:
                updated_segments.append(
                    prepared_segment.model_copy(
                        update={
                            "teaching": prepared_segment.teaching.model_copy(
                                update={
                                    "status": TeachingStatus.FAILED,
                                    "summary": prepared_segment.ai_description,
                                    "steps": [],
                                    "tips": ["生成失败，请稍后重试或检查 teaching 配置"],
                                    "beat_cues": build_null_beat_cues(prepared_segment.beat_count),
                                }
                            )
                        }
                    )
                )

        save_lesson(lesson.model_copy(update={"segments": updated_segments}))

    async def _generate_teaching_with_retry(
        self,
        lesson,
        segment,
        generate_teaching_for_segment,
    ) -> Teaching:
        last_payload: dict | None = None

        for attempt in range(_TEACHING_MAX_RETRIES):
            teaching_payload = await asyncio.to_thread(
                generate_teaching_for_segment,
                str(_clip_path_for_segment(segment.clip_url)),
                segment.model_dump(mode="json"),
                {
                    "bpm": lesson.bpm,
                    "title": lesson.title,
                    "section_label": segment.section_label,
                },
            )
            last_payload = teaching_payload

            if teaching_payload.get("status") == TeachingStatus.READY.value:
                if attempt:
                    logger.info(
                        "Teaching generation recovered for lesson=%s segment=%s on attempt %d",
                        lesson.id,
                        segment.id,
                        attempt + 1,
                    )
                return Teaching.model_validate(teaching_payload)

            error = str(teaching_payload.get("error") or "").strip()
            logger.warning(
                "Teaching generation failed for lesson=%s segment=%s attempt=%d/%d: %s",
                lesson.id,
                segment.id,
                attempt + 1,
                _TEACHING_MAX_RETRIES,
                error or "unknown error",
            )
            if attempt < _TEACHING_MAX_RETRIES - 1:
                await asyncio.sleep(2**attempt)

        fallback_payload = {
            **(last_payload or {}),
            "tips": (last_payload or {}).get("tips") or ["生成失败，请稍后重试或检查 teaching 配置"],
            "beat_cues": (last_payload or {}).get("beat_cues")
            or build_null_beat_cues(segment.beat_count),
        }
        return Teaching.model_validate(fallback_payload)


def _needs_reexport_for_teaching(lesson_id: str, segment) -> bool:
    clip_url = getattr(segment, "clip_url", "") or ""
    thumb_url = getattr(segment, "thumbnail", "") or ""
    expected_prefix = f"/clips/{lesson_id}_"
    expected_thumb_prefix = f"/thumbs/{lesson_id}_"
    return not (
        clip_url.startswith(expected_prefix)
        and thumb_url.startswith(expected_thumb_prefix)
    )


teaching_queue = TeachingQueue()
