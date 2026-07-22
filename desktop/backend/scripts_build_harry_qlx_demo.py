"""同步解析 harry/qlx 为固定 demo 课程，并调用千问 VLM 生成教学。"""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv

DESKTOP = Path(__file__).resolve().parent.parent
BACKEND = DESKTOP / "backend"
DATA = BACKEND / "data"
VIDEOS = DATA / "videos"

load_dotenv(DESKTOP / ".env")
os.environ["DP_VLM_MODE"] = os.environ.get("DP_VLM_MODE") or "real"
os.environ.pop("TEACHING_USE_MOCK", None)
os.environ["USE_MOCK_TEACHING"] = "false"

sys.path.insert(0, str(DESKTOP))
sys.path.insert(0, str(BACKEND))

from models import Lesson, Teaching, TeachingStatus  # noqa: E402
from pipeline import process_video  # noqa: E402
from services.clip_reexport import reexport_all_segments, reexport_segment_clip_and_thumb  # noqa: E402
from services.lesson_store import save_lesson  # noqa: E402
from services.teaching_cues import build_null_beat_cues  # noqa: E402
from teaching.generate_teaching import generate_teaching_for_segment  # noqa: E402

JOBS = [
    {
        "source": VIDEOS / "harry.mp4",
        "lesson_id": "harry_dp",
        "title": "HARRY · Demo 同舞",
        "dest_name": "harry_dp.mp4",
    },
    {
        "source": VIDEOS / "qlx.mp4",
        "lesson_id": "qlx_dp",
        "title": "QLX · Demo 同舞",
        "dest_name": "qlx_dp.mp4",
    },
]


def build_lesson(source: Path, lesson_id: str, title: str, dest_name: str) -> Lesson:
    VIDEOS.mkdir(parents=True, exist_ok=True)
    dest = VIDEOS / dest_name
    if source.resolve() != dest.resolve():
        shutil.copyfile(source, dest)
    print(f"[pipeline] {source.name} -> {lesson_id}", flush=True)
    raw = process_video(str(dest), str(DATA))
    raw["id"] = lesson_id
    raw["title"] = title
    raw["source_url"] = ""
    raw["video_url"] = f"/videos/{dest_name}"
    raw["confirmed"] = True
    raw["segments"] = [{**seg, "lesson_id": lesson_id} for seg in raw["segments"]]
    if raw["segments"]:
        raw["thumbnail"] = raw["segments"][0]["thumbnail"]
    lesson = Lesson.model_validate(raw)
    lesson = reexport_all_segments(lesson)
    save_lesson(lesson)
    print(f"[pipeline] saved segments={len(lesson.segments)}", flush=True)
    return lesson


def fill_teaching(lesson: Lesson) -> Lesson:
    updated = []
    for idx, segment in enumerate(lesson.segments):
        if segment.deleted or segment.is_still:
            updated.append(segment)
            continue
        print(f"[vlm] {lesson.id} seg {idx + 1}/{len(lesson.segments)} {segment.id}", flush=True)
        prepared = segment
        clip_rel = (segment.clip_url or "").lstrip("/")
        clip_path = DATA / clip_rel
        if not clip_path.exists():
            prepared = reexport_segment_clip_and_thumb(lesson, segment)
            clip_path = DATA / prepared.clip_url.lstrip("/")
        try:
            payload = generate_teaching_for_segment(
                str(clip_path),
                prepared.model_dump(mode="json"),
                {
                    "bpm": lesson.bpm,
                    "title": lesson.title,
                    "section_label": prepared.section_label,
                },
            )
            teaching = Teaching.model_validate(payload)
            if teaching.status != TeachingStatus.READY:
                print(f"[vlm] non-ready status={teaching.status} err={getattr(teaching, 'error', None)}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[vlm] FAILED {exc}", flush=True)
            teaching = prepared.teaching.model_copy(
                update={
                    "status": TeachingStatus.FAILED,
                    "summary": prepared.ai_description,
                    "steps": [],
                    "tips": ["生成失败，请稍后重试或检查 teaching 配置"],
                    "beat_cues": build_null_beat_cues(prepared.beat_count),
                }
            )
        updated.append(prepared.model_copy(update={"teaching": teaching}))
    next_lesson = lesson.model_copy(update={"segments": updated, "confirmed": True})
    save_lesson(next_lesson)
    return next_lesson


def main() -> int:
    key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
    print(f"key_len={len(key)} mode={os.environ.get('DP_VLM_MODE')}", flush=True)
    if not key:
        print("DASHSCOPE_API_KEY missing", flush=True)
        return 1

    results = []
    for job in JOBS:
        if not job["source"].exists():
            print(f"missing {job['source']}", flush=True)
            return 1
        lesson = build_lesson(job["source"], job["lesson_id"], job["title"], job["dest_name"])
        lesson = fill_teaching(lesson)
        ready = sum(
            1
            for s in lesson.segments
            if not s.deleted and not s.is_still and s.teaching.status == TeachingStatus.READY
        )
        results.append(
            {
                "lesson_id": lesson.id,
                "title": lesson.title,
                "thumbnail": lesson.thumbnail,
                "video_url": lesson.video_url,
                "segments": len(lesson.segments),
                "teaching_ready": ready,
            }
        )
        print(f"[done] {lesson.id} teaching_ready={ready}", flush=True)

    out = DATA / "demo_new_lessons.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print("WROTE", out, flush=True)
    print(json.dumps(results, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
