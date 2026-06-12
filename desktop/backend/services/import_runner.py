from __future__ import annotations

import asyncio
import hashlib
import shutil
import sys
import uuid
from pathlib import Path

from models import Lesson
from services.douyin_fetch import (
    FetchError,
    download_video_to_path,
    normalize_douyin_url,
    read_download_metadata,
)
from services.clip_reexport import reexport_all_segments
from services.job_store import update_job
from services.lesson_naming import derive_douyin_title, derive_upload_title
from services.lesson_store import save_lesson
from services.teaching_queue import teaching_queue


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_DATA_DIR = REPO_ROOT / "backend" / "data"
VIDEOS_DIR = BACKEND_DATA_DIR / "videos"
IMPORT_COOKIES_DIR = BACKEND_DATA_DIR / "import_cookies"


def _lesson_id_from_url(url: str) -> str:
    return "les_" + hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]


def _ensure_repo_root_path() -> None:
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))


def _run_pipeline(
    video_path: Path,
    lesson_id: str,
    *,
    source_url: str,
    title: str,
) -> Lesson:
    _ensure_repo_root_path()
    from pipeline import process_video  # noqa: PLC0415

    raw_lesson = process_video(str(video_path), str(BACKEND_DATA_DIR))
    raw_lesson["id"] = lesson_id
    raw_lesson["title"] = title
    raw_lesson["source_url"] = source_url
    raw_lesson["video_url"] = f"/videos/{video_path.name}"
    raw_lesson["segments"] = [
        {**segment, "lesson_id": lesson_id} for segment in raw_lesson["segments"]
    ]
    if raw_lesson["segments"]:
        raw_lesson["thumbnail"] = raw_lesson["segments"][0]["thumbnail"]
    return Lesson.model_validate(raw_lesson)


def _run_import_job_sync(
    job_id: str,
    url: str,
    cookies_file: Path | None,
) -> Lesson:
    normalized_url = normalize_douyin_url(url)
    lesson_id = _lesson_id_from_url(normalized_url)
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    dest = VIDEOS_DIR / f"{lesson_id}.mp4"
    download_video_to_path(
        normalized_url,
        dest,
        cookies_file=cookies_file,
        progress_callback=lambda message: update_job(job_id, fallback_hint=message),
    )
    download_metadata = read_download_metadata(dest)

    update_job(
        job_id,
        status="processing",
        lesson_id=lesson_id,
        progress=35,
        phase="beat",
        fallback_hint="视频下载完成，正在切片和生成课程...",
    )
    lesson = _run_pipeline(
        dest,
        lesson_id,
        source_url=normalized_url,
        title="抖音导入",
    )
    lesson = lesson.model_copy(update={"title": derive_douyin_title(download_metadata, lesson)})
    update_job(
        job_id,
        status="processing",
        lesson_id=lesson_id,
        progress=72,
        phase="segment",
        fallback_hint="动作卡已经切好，正在整理课程内容...",
    )
    lesson = reexport_all_segments(lesson)
    update_job(
        job_id,
        status="processing",
        lesson_id=lesson_id,
        progress=88,
        phase="teaching",
        fallback_hint="课程即将准备完成，正在生成分步教学...",
    )
    save_lesson(lesson)
    return lesson


def _run_upload_job_sync(
    job_id: str,
    upload_file: Path,
    filename: str,
) -> Lesson:
    safe_name = Path(filename).name.replace("..", "_") or "upload.mp4"
    title = Path(safe_name).stem or "本地上传"
    upload_suffix = upload_file.suffix.lower()
    if upload_suffix not in {".mp4", ".webm", ".mov", ".m4v"}:
        upload_suffix = ".mp4"

    lesson_id = "les_" + uuid.uuid4().hex[:12]
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    dest = VIDEOS_DIR / f"{lesson_id}{upload_suffix}"
    shutil.copyfile(upload_file, dest)

    update_job(
        job_id,
        status="processing",
        lesson_id=lesson_id,
        progress=35,
        phase="beat",
        fallback_hint="本地视频上传完成，正在切片和生成课程...",
    )
    lesson = _run_pipeline(
        dest,
        lesson_id,
        source_url="",
        title=title,
    )
    lesson = lesson.model_copy(update={"title": derive_upload_title(safe_name, lesson)})
    update_job(
        job_id,
        status="processing",
        lesson_id=lesson_id,
        progress=72,
        phase="segment",
        fallback_hint="动作卡已经切好，正在整理课程内容...",
    )
    lesson = reexport_all_segments(lesson)
    update_job(
        job_id,
        status="processing",
        lesson_id=lesson_id,
        progress=88,
        phase="teaching",
        fallback_hint="课程即将准备完成，正在生成分步教学...",
    )
    save_lesson(lesson)
    return lesson


async def run_import_job(
    job_id: str,
    url: str,
    cookies_file_path: str | None = None,
) -> None:
    cookies_file = Path(cookies_file_path) if cookies_file_path else None
    try:
        update_job(
            job_id,
            status="downloading",
            progress=15,
            phase="download",
            fallback_hint="正在下载视频资源...",
        )
        lesson = await asyncio.to_thread(
            _run_import_job_sync,
            job_id,
            url,
            cookies_file,
        )
        update_job(
            job_id,
            status="ready",
            lesson_id=lesson.id,
            progress=100,
            phase="teaching",
            fallback_hint="导入完成，正在进入课程页。",
        )

        seg_ids = [segment.id for segment in lesson.segments]
        await teaching_queue.enqueue(lesson.id, seg_ids)
    except FetchError as exc:
        update_job(job_id, status="failed", error=str(exc))
    except Exception as exc:
        update_job(job_id, status="failed", error=str(exc))
    finally:
        if cookies_file and cookies_file.exists():
            cookies_file.unlink(missing_ok=True)


def save_import_cookies(job_id: str, filename: str, content: bytes) -> Path:
    safe_name = Path(filename).name or "cookies.txt"
    IMPORT_COOKIES_DIR.mkdir(parents=True, exist_ok=True)
    dest = IMPORT_COOKIES_DIR / f"{job_id}_{safe_name}"
    dest.write_bytes(content)
    return dest


async def run_upload_job(job_id: str, upload_file_path: str, filename: str) -> None:
    upload_file = Path(upload_file_path)
    try:
        update_job(
            job_id,
            status="downloading",
            progress=15,
            phase="download",
            fallback_hint="正在接收本地视频...",
        )
        lesson = await asyncio.to_thread(
            _run_upload_job_sync,
            job_id,
            upload_file,
            filename,
        )
        update_job(
            job_id,
            status="ready",
            lesson_id=lesson.id,
            progress=100,
            phase="teaching",
            fallback_hint="导入完成，正在进入课程页。",
        )

        seg_ids = [segment.id for segment in lesson.segments]
        await teaching_queue.enqueue(lesson.id, seg_ids)
    except Exception as exc:
        update_job(job_id, status="failed", error=str(exc))
    finally:
        upload_file.unlink(missing_ok=True)
