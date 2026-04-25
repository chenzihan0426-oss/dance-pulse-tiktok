from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime
from pathlib import Path

from models import TrackingResult


BASE_DIR = Path(__file__).resolve().parent.parent
TRACKING_DIR = BASE_DIR / "data" / "tracking"
TRACKING_RESULTS_FILE = TRACKING_DIR / "results.json"
TRACKING_VIDEOS_DIR = TRACKING_DIR / "videos"


def ensure_tracking_dirs() -> None:
    TRACKING_DIR.mkdir(parents=True, exist_ok=True)
    TRACKING_VIDEOS_DIR.mkdir(parents=True, exist_ok=True)


def _read_results() -> list[dict]:
    ensure_tracking_dirs()
    if not TRACKING_RESULTS_FILE.exists():
        return []
    try:
      return json.loads(TRACKING_RESULTS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []


def _write_results(results: list[dict]) -> None:
    ensure_tracking_dirs()
    TRACKING_RESULTS_FILE.write_text(
        json.dumps(results, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def create_tracking_result_id() -> str:
    return f"trk_{secrets.token_hex(6)}"


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def save_tracking_result(result: TrackingResult) -> TrackingResult:
    raw_results = _read_results()
    raw_results.append(result.model_dump(mode="json"))
    _write_results(raw_results)
    return result


def get_tracking_result(result_id: str) -> TrackingResult:
    for item in _read_results():
        if item.get("id") == result_id:
            return TrackingResult.model_validate(item)
    raise LookupError(result_id)


def update_tracking_result(result: TrackingResult) -> TrackingResult:
    raw_results = _read_results()
    updated = False
    next_results: list[dict] = []
    for item in raw_results:
        if item.get("id") == result.id:
            next_results.append(result.model_dump(mode="json"))
            updated = True
        else:
            next_results.append(item)
    if not updated:
        raise LookupError(result.id)
    _write_results(next_results)
    return result


def delete_tracking_result(result_id: str) -> None:
    raw_results = _read_results()
    next_results = [item for item in raw_results if item.get("id") != result_id]
    if len(next_results) == len(raw_results):
        raise LookupError(result_id)
    _write_results(next_results)


def list_tracking_results(*, lesson_id: str | None = None, user_id: str | None = None) -> list[TrackingResult]:
    raw_results = [TrackingResult.model_validate(item) for item in _read_results()]
    filtered = raw_results
    if lesson_id:
        filtered = [item for item in filtered if item.lessonId == lesson_id]
    if user_id:
        filtered = [item for item in filtered if item.userId == user_id]
    return sorted(filtered, key=lambda item: item.createdAt, reverse=True)
