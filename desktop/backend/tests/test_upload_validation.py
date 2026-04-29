from __future__ import annotations

import asyncio
from io import BytesIO
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from services.upload_validation import guess_video_extension, save_upload_to_path  # noqa: E402


def test_save_upload_to_path_enforces_max_bytes(tmp_path) -> None:
    destination = tmp_path / "upload.mp4"
    upload = UploadFile(filename="upload.mp4", file=BytesIO(b"abcdef"))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            save_upload_to_path(
                upload,
                destination,
                max_bytes=3,
                empty_detail="Upload video is empty",
            )
        )

    assert exc.value.status_code == 413
    assert not destination.exists()


def test_guess_video_extension_rejects_non_video_upload() -> None:
    upload = UploadFile(filename="notes.txt", file=BytesIO(b"not a video"))

    with pytest.raises(HTTPException) as exc:
        guess_video_extension(upload)

    assert exc.value.status_code == 400
