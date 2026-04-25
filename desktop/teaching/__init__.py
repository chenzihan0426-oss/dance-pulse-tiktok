"""M6 teaching package exports."""

from .generate_teaching import (
    generate_teaching_for_lesson,
    generate_teaching_for_segment,
)

__all__ = [
    "generate_teaching_for_segment",
    "generate_teaching_for_lesson",
]
