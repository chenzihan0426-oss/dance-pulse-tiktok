from __future__ import annotations

from fastapi import APIRouter, HTTPException

from models import Lesson, PatchSegmentsRequest
from services.lesson_store import load_lesson, save_lesson
from services.patch_ops import apply_patch_ops


router = APIRouter(prefix="/api/lessons", tags=["segments"])


@router.patch("/{lesson_id}/segments", response_model=Lesson)
def patch_segments(lesson_id: str, payload: PatchSegmentsRequest) -> Lesson:
    lesson = load_lesson(lesson_id)
    try:
        updated_lesson = apply_patch_ops(lesson, payload.ops)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    save_lesson(updated_lesson)
    return updated_lesson
