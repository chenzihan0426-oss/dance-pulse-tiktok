from __future__ import annotations

import os
from pathlib import Path

from fastapi import HTTPException, UploadFile


CHUNK_SIZE = 1024 * 1024
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v"}


def _read_mb_env(name: str, default_mb: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default_mb * 1024 * 1024
    try:
        value_mb = int(raw)
    except ValueError:
        return default_mb * 1024 * 1024
    return max(1, value_mb) * 1024 * 1024


MAX_VIDEO_UPLOAD_BYTES = _read_mb_env("DANCEPULSE_MAX_VIDEO_UPLOAD_MB", 512)
MAX_COOKIES_UPLOAD_BYTES = _read_mb_env("DANCEPULSE_MAX_COOKIES_UPLOAD_MB", 1)


def guess_video_extension(file: UploadFile) -> str:
    suffix = Path(file.filename or "").suffix.lower()
    content_type = (file.content_type or "").lower()

    if suffix in VIDEO_EXTENSIONS:
        return suffix
    if content_type == "video/mp4":
        return ".mp4"
    if content_type == "video/quicktime":
        return ".mov"
    if content_type in {"video/webm", "video/x-m4v"}:
        return ".webm" if content_type == "video/webm" else ".m4v"
    if content_type.startswith("video/"):
        return ".webm"

    raise HTTPException(status_code=400, detail="Unsupported video file type")


async def save_upload_to_path(
    file: UploadFile,
    destination: Path,
    *,
    max_bytes: int,
    empty_detail: str,
) -> int:
    destination.parent.mkdir(parents=True, exist_ok=True)
    total = 0

    try:
        with destination.open("wb") as output:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(status_code=413, detail="Uploaded file is too large")
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    if total == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=empty_detail)

    return total


async def read_upload_with_limit(
    file: UploadFile,
    *,
    max_bytes: int,
    empty_detail: str,
) -> bytes:
    chunks: list[bytes] = []
    total = 0

    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail="Uploaded file is too large")
        chunks.append(chunk)

    if total == 0:
        raise HTTPException(status_code=400, detail=empty_detail)

    return b"".join(chunks)
