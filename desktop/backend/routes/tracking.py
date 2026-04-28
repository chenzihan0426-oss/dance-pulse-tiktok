from __future__ import annotations

from fastapi import APIRouter, File, Header, UploadFile

from models import TrackingResult, TrackingResultsResponse
from services.auth_store import get_user_by_token, parse_auth_token
from services.lesson_store import load_lesson
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


def _resolve_user_id(authorization: str | None) -> str:
    if not authorization:
        return "guest_local"
    token = parse_auth_token(authorization)
    return get_user_by_token(token).id
