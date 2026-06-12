from __future__ import annotations

import secrets
from datetime import UTC, datetime
from pathlib import Path

from sqlmodel import select

from models import TrackingResult
from services.db import session_scope
from services.db_models import TrackingResultRow


BASE_DIR = Path(__file__).resolve().parent.parent
TRACKING_DIR = BASE_DIR / "data" / "tracking"
TRACKING_VIDEOS_DIR = TRACKING_DIR / "videos"


def ensure_tracking_dirs() -> None:
    # 跟练录制视频仍存文件系统，保留视频目录的创建。
    TRACKING_DIR.mkdir(parents=True, exist_ok=True)
    TRACKING_VIDEOS_DIR.mkdir(parents=True, exist_ok=True)


def create_tracking_result_id() -> str:
    return f"trk_{secrets.token_hex(6)}"


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def save_tracking_result(result: TrackingResult) -> TrackingResult:
    with session_scope() as s:
        s.add(TrackingResultRow.from_model(result))
    return result


def get_tracking_result(result_id: str) -> TrackingResult:
    with session_scope() as s:
        row = s.get(TrackingResultRow, result_id)
        if row is None:
            raise LookupError(result_id)
        return row.to_model()


def update_tracking_result(result: TrackingResult) -> TrackingResult:
    with session_scope() as s:
        if s.get(TrackingResultRow, result.id) is None:
            raise LookupError(result.id)
        s.merge(TrackingResultRow.from_model(result))
    return result


def delete_tracking_result(result_id: str) -> None:
    with session_scope() as s:
        row = s.get(TrackingResultRow, result_id)
        if row is None:
            raise LookupError(result_id)
        s.delete(row)


def list_tracking_results(*, lesson_id: str | None = None, user_id: str | None = None) -> list[TrackingResult]:
    with session_scope() as s:
        stmt = select(TrackingResultRow)
        if lesson_id:
            stmt = stmt.where(TrackingResultRow.lesson_id == lesson_id)
        if user_id:
            stmt = stmt.where(TrackingResultRow.user_id == user_id)
        results = [row.to_model() for row in s.exec(stmt).all()]
    return sorted(results, key=lambda item: item.createdAt, reverse=True)
