from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from models import Lesson  # noqa: E402
from services.lesson_naming import (  # noqa: E402
    derive_douyin_title,
    derive_title_for_existing_lesson,
    derive_upload_title,
    title_needs_refresh,
)


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$")


def _load_sample_lesson() -> Lesson:
    return Lesson(
        id="les_test",
        title="upload",
        source_url="",
        duration=10.0,
        bpm=120.0,
        video_url="",
        thumbnail="",
        confirmed=False,
        beats=[],
        sections=[],
        segments=[],
    )


class LessonNamingTests(unittest.TestCase):
    def test_douyin_prefers_song_or_dance_name(self) -> None:
        lesson = _load_sample_lesson()
        title = derive_douyin_title({"title": "《Whiplash》翻跳挑战"}, lesson)
        self.assertEqual(title, "Whiplash")

    def test_upload_uses_readable_name_from_filename(self) -> None:
        lesson = _load_sample_lesson()
        title = derive_upload_title("Blackpink_whiplash_cover.mp4", lesson)
        self.assertEqual(title, "Blackpink whiplash")

    def test_generated_upload_filename_falls_back_to_date(self) -> None:
        lesson = _load_sample_lesson()
        title = derive_upload_title("VID_20260419_173355_9f2eab3f.mp4", lesson)
        self.assertRegex(title, DATE_RE)
        self.assertFalse(title_needs_refresh(title))

    def test_existing_action_title_backfills_to_date(self) -> None:
        lesson = _load_sample_lesson().model_copy(update={"title": "快速转身与步伐移动的衔接"})
        self.assertTrue(title_needs_refresh(lesson.title))
        title = derive_title_for_existing_lesson(lesson)
        self.assertRegex(title, DATE_RE)
        self.assertFalse(title_needs_refresh(title))


if __name__ == "__main__":
    unittest.main()
