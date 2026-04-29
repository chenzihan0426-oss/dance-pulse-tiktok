from __future__ import annotations

import asyncio
import sys
from io import BytesIO
from pathlib import Path

from fastapi import UploadFile


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import routes.tracking as tracking_route  # noqa: E402
import services.tracking_store as tracking_store  # noqa: E402


SAMPLE_UPLOAD = BACKEND_DIR / "data" / "clips" / "les_122ea874306b_seg_000.mp4"


def test_tracking_upload_and_history(tmp_path, monkeypatch) -> None:
    tracking_dir = tmp_path / "tracking"
    videos_dir = tracking_dir / "videos"
    results_file = tracking_dir / "results.json"

    monkeypatch.setattr(tracking_store, "TRACKING_DIR", tracking_dir)
    monkeypatch.setattr(tracking_store, "TRACKING_VIDEOS_DIR", videos_dir)
    monkeypatch.setattr(tracking_store, "TRACKING_RESULTS_FILE", results_file)
    monkeypatch.setattr(tracking_route, "TRACKING_VIDEOS_DIR", videos_dir)

    tracking_store.ensure_tracking_dirs()

    content = SAMPLE_UPLOAD.read_bytes()
    upload = UploadFile(filename="sample.mp4", file=BytesIO(content))

    result = asyncio.run(
        tracking_route.analyze_tracking_video(
            "les_122ea874306b",
            file=upload,
            authorization=None,
        )
    )

    assert result.lessonId == "les_122ea874306b"
    assert result.userId == "guest_local"
    assert result.score >= 0
    assert len(result.segmentScores) > 0
    assert results_file.exists()

    history = tracking_route.get_tracking_results("les_122ea874306b", authorization=None)
    assert len(history.results) == 1
    assert history.results[0].id == result.id
