from __future__ import annotations

from fastapi import APIRouter

from models import ConfirmLessonResponse, Lesson, LessonListItem, RegenerateLessonRequest
from services.clip_reexport import reexport_lesson_clips
from services.regenerate_lesson import regenerate_lesson_segments
from services.lesson_store import load_lesson, list_lessons, save_lesson
from services.teaching_queue import teaching_queue


router = APIRouter(prefix="/api/lessons", tags=["lessons"])


@router.get("", response_model=list[LessonListItem])
def get_lessons() -> list[LessonListItem]:
    return list_lessons()


@router.get("/{lesson_id}", response_model=Lesson)
def get_lesson(lesson_id: str) -> Lesson:
    return load_lesson(lesson_id)


@router.post("/{lesson_id}/confirm", response_model=ConfirmLessonResponse)
async def confirm_lesson(lesson_id: str) -> ConfirmLessonResponse:
    lesson = load_lesson(lesson_id)
    confirmed_lesson = lesson.model_copy(update={"confirmed": True})
    exported_lesson = reexport_lesson_clips(confirmed_lesson)
    save_lesson(exported_lesson)
    edited_ids = [segment.id for segment in exported_lesson.segments if segment.user_edited]
    await teaching_queue.enqueue(lesson_id, edited_ids)
    return ConfirmLessonResponse(ok=True, lesson=exported_lesson)


@router.post("/{lesson_id}/regenerate", response_model=Lesson)
def regenerate_lesson(lesson_id: str, payload: RegenerateLessonRequest) -> Lesson:
    lesson = load_lesson(lesson_id)
    regenerated = regenerate_lesson_segments(lesson, payload)
    save_lesson(regenerated)
    return regenerated
