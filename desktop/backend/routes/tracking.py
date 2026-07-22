from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, File, Header, UploadFile

from models import TrackingResult, TrackingResultsResponse
from services.auth_store import get_user_by_token, parse_auth_token
from services.lesson_store import load_lesson
from services.session_store import (
    get_difficulty_aggregates,
    list_sessions,
    save_session_result,
)
from services.tracking_scoring import build_tracking_result
from services.tracking_store import (
    TRACKING_VIDEOS_DIR,
    create_tracking_result_id,
    ensure_tracking_dirs,
    list_tracking_results,
    save_tracking_result,
)
from services.upload_validation import MAX_VIDEO_UPLOAD_BYTES, guess_video_extension, save_upload_to_path


router = APIRouter(prefix="/api/lessons", tags=["tracking"])


@router.post("/{lesson_id}/tracking", response_model=TrackingResult)
async def analyze_tracking_video(
    lesson_id: str,
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> TrackingResult:
    lesson = load_lesson(lesson_id)
    result_id = create_tracking_result_id()
    suffix = guess_video_extension(file)
    ensure_tracking_dirs()
    video_path = (TRACKING_VIDEOS_DIR / f"{result_id}{suffix}").resolve()
    await save_upload_to_path(
        file,
        video_path,
        max_bytes=MAX_VIDEO_UPLOAD_BYTES,
        empty_detail="Tracking video is empty",
    )

    user_id = _resolve_user_id(authorization)
    video_url = f"/tracking-videos/{video_path.name}"
    result = build_tracking_result(
        result_id=result_id,
        lesson=lesson,
        user_id=user_id,
        video_url=video_url,
        uploaded_video_path=video_path,
    )
    return save_tracking_result(result)


@router.get("/{lesson_id}/tracking/results", response_model=TrackingResultsResponse)
def get_tracking_results(
    lesson_id: str,
    authorization: str | None = Header(default=None),
) -> TrackingResultsResponse:
    load_lesson(lesson_id)
    user_id = _resolve_user_id(authorization)
    results = list_tracking_results(lesson_id=lesson_id, user_id=user_id)
    return TrackingResultsResponse(results=results)


@router.post("/{lesson_id}/tracking/sessions")
def submit_tracking_session(
    lesson_id: str,
    payload: dict[str, Any] = Body(...),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """接收浏览器端姿态比对产出的 SessionResult，落库 + 更新难点聚合。"""
    load_lesson(lesson_id)
    user_id = _resolve_user_id(authorization)
    # lesson_id 以 URL 为准，避免前端 payload 篡改
    payload = {**payload, "lessonId": lesson_id}
    return save_session_result(user_id=user_id, payload=payload)


@router.get("/{lesson_id}/tracking/sessions")
def get_tracking_sessions(
    lesson_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    load_lesson(lesson_id)
    user_id = _resolve_user_id(authorization)
    return {"sessions": list_sessions(lesson_id=lesson_id, user_id=user_id)}


@router.get("/{lesson_id}/tracking/difficulty")
def get_tracking_difficulty(
    lesson_id: str,
    scope: str = "global",
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """读某课逐动作难度聚合。scope='global' 或 'user:<id>'。"""
    load_lesson(lesson_id)
    if scope == "me":
        user_id = _resolve_user_id(authorization)
        scope = f"user:{user_id}"
    return {"aggregates": get_difficulty_aggregates(lesson_id=lesson_id, scope=scope)}


def _resolve_user_id(authorization: str | None) -> str:
    if not authorization:
        return "guest_local"
    token = parse_auth_token(authorization)
    return get_user_by_token(token).id
