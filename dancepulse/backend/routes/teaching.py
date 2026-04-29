from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from models import SegmentContextResponse, TeachingRegenerateResponse, TeachingStatus
from services.lesson_store import list_lesson_files, load_lesson, save_lesson
from services.teaching_queue import teaching_queue


router = APIRouter(prefix="/api", tags=["teaching"])


def _find_lesson_by_segment_id(segment_id: str):
    for lesson_file in list_lesson_files():
        lesson = load_lesson(lesson_file.stem)
        for segment in lesson.segments:
            if segment.id == segment_id:
                return lesson, segment
    raise HTTPException(status_code=404, detail="Segment not found")


def _find_segment_in_lesson(lesson_id: str, segment_id: str):
    lesson = load_lesson(lesson_id)
    for segment in lesson.segments:
        if segment.id == segment_id:
            return lesson, segment
    raise HTTPException(status_code=404, detail="Segment not found in lesson")


@router.get(
    "/segments/{segment_id}/context",
    response_model=SegmentContextResponse,
)
def get_segment_context(segment_id: str) -> SegmentContextResponse:
    lesson, segment = _find_lesson_by_segment_id(segment_id)
    return SegmentContextResponse(lesson=lesson, segment=segment)


async def _regenerate_lesson_segment(
    lesson_id: str,
    segment_id: str,
    response: Response,
) -> TeachingRegenerateResponse:
    lesson, segment = _find_segment_in_lesson(lesson_id, segment_id)
    updated_segments = []
    for item in lesson.segments:
        if item.id == segment.id:
            updated_segments.append(
                item.model_copy(
                    update={"teaching": item.teaching.model_copy(update={"status": TeachingStatus.PENDING})}
                )
            )
        else:
            updated_segments.append(item)

    save_lesson(lesson.model_copy(update={"segments": updated_segments}))
    await teaching_queue.enqueue(lesson.id, [segment_id])
    response.status_code = status.HTTP_202_ACCEPTED
    return TeachingRegenerateResponse(ok=True, status="pending")


@router.post(
    "/lessons/{lesson_id}/segments/{segment_id}/teaching/regenerate",
    response_model=TeachingRegenerateResponse,
)
async def regenerate_teaching(
    lesson_id: str,
    segment_id: str,
    response: Response,
) -> TeachingRegenerateResponse:
    return await _regenerate_lesson_segment(lesson_id, segment_id, response)


@router.post(
    "/segments/{segment_id}/teaching/regenerate",
    response_model=TeachingRegenerateResponse,
)
async def regenerate_teaching_legacy(
    segment_id: str,
    response: Response,
) -> TeachingRegenerateResponse:
    lesson, _ = _find_lesson_by_segment_id(segment_id)
    return await _regenerate_lesson_segment(lesson.id, segment_id, response)
