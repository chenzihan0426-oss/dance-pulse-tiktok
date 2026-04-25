from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import ValidationError

if __package__ is None or __package__ == "":
    _here = Path(__file__).resolve().parent
    sys.path.insert(0, str(_here.parent))
    from backend.services.teaching_cues import build_null_beat_cues
    from teaching.keyframe_extract import extract_keyframes_base64
    from teaching.prompts import build_teaching_prompt
    from teaching.schema import TeachingPayload, parse_and_validate_teaching
    from teaching.vlm_client import BaseVLMClient, VLMError, build_default_client
else:
    from backend.services.teaching_cues import build_null_beat_cues
    from .keyframe_extract import extract_keyframes_base64
    from .prompts import build_teaching_prompt
    from .schema import TeachingPayload, parse_and_validate_teaching
    from .vlm_client import BaseVLMClient, VLMError, build_default_client

logger = logging.getLogger(__name__)

_MAX_WORKERS = 3
_N_KEYFRAMES = 4
_DEFAULT_CLIPS_DIR = Path(__file__).resolve().parent.parent / "backend" / "data" / "clips"
_save_lock = threading.Lock()


def generate_teaching_for_segment(
    clip_path: str,
    segment: dict[str, Any],
    lesson_context: dict[str, Any],
    client: BaseVLMClient | None = None,
) -> dict[str, Any]:
    vlm = client or build_default_client()
    now = _now_iso()
    beat_count = int(segment.get("beat_count", 0) or 0)

    try:
        frames = extract_keyframes_base64(clip_path, n_frames=_N_KEYFRAMES)
    except (FileNotFoundError, RuntimeError) as exc:
        logger.error("keyframe extraction failed for %s: %s", segment.get("id"), exc)
        return _failed_teaching(segment, now, reason=str(exc))

    prompt = build_teaching_prompt(segment, lesson_context)

    try:
        raw = vlm.generate(prompt, frames)
    except VLMError as exc:
        logger.error("VLM call failed for %s: %s", segment.get("id"), exc)
        return _failed_teaching(segment, now, reason=str(exc))

    try:
        payload: TeachingPayload = parse_and_validate_teaching(
            raw,
            beat_count,
            logger=logger,
            context=f"segment {segment.get('id', 'unknown')}",
        )
    except (ValueError, ValidationError) as exc:
        logger.error(
            "teaching schema validation failed for %s: %s\nraw: %.300s",
            segment.get("id"),
            exc,
            raw,
        )
        return _failed_teaching(segment, now, reason=f"schema error: {exc}")

    return {
        "status": "ready",
        "summary": payload.summary,
        "steps": [step.model_dump() for step in payload.steps],
        "tips": payload.tips,
        "beat_cues": payload.beat_cues,
        "generated_at": now,
    }


def _failed_teaching(segment: dict[str, Any], now: str, reason: str) -> dict[str, Any]:
    fallback_summary = segment.get("ai_description") or ""
    beat_count = int(segment.get("beat_count", 0) or 0)
    return {
        "status": "failed",
        "summary": fallback_summary,
        "steps": [],
        "tips": [],
        "beat_cues": build_null_beat_cues(beat_count),
        "generated_at": now,
        "error": reason[:300],
    }


def generate_teaching_for_lesson(
    lesson_json_path: str,
    clips_dir: str | None = None,
    force: bool = False,
    client: BaseVLMClient | None = None,
) -> None:
    path = Path(lesson_json_path)
    if not path.exists():
        raise FileNotFoundError(f"lesson JSON not found: {lesson_json_path}")

    clips_path = Path(clips_dir) if clips_dir else _DEFAULT_CLIPS_DIR

    with path.open("r", encoding="utf-8") as file:
        lesson = json.load(file)

    segments = lesson.get("segments", [])
    if not segments:
        logger.warning("lesson has no segments: %s", lesson_json_path)
        return

    targets = [
        (index, segment)
        for index, segment in enumerate(segments)
        if force or (segment.get("teaching") or {}).get("status") != "ready"
    ]
    if not targets:
        logger.info("all segments already ready, nothing to do")
        return

    total = len(targets)
    logger.info("processing %d/%d segments (force=%s)", total, len(segments), force)

    vlm = client or build_default_client()
    lesson_context = {"bpm": lesson.get("bpm"), "title": lesson.get("title")}

    completed = 0
    failed = 0

    def _work(index: int, segment: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        clip_file = _resolve_clip_path(segment, clips_path)
        teaching = generate_teaching_for_segment(
            str(clip_file),
            segment,
            lesson_context,
            client=vlm,
        )
        return index, teaching

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
        futures = {pool.submit(_work, index, segment): (index, segment) for index, segment in targets}

        for future in as_completed(futures):
            index, segment = futures[future]
            try:
                _, teaching = future.result()
            except Exception as exc:  # noqa: BLE001
                logger.exception("unexpected error for segment %s", segment.get("id"))
                teaching = _failed_teaching(segment, _now_iso(), reason=f"unexpected: {exc}")

            with _save_lock:
                lesson["segments"][index]["teaching"] = teaching
                _save_lesson(path, lesson)

            completed += 1
            if teaching["status"] == "ready":
                print(f"[{completed}/{total}] {segment.get('id')} ready")
            else:
                failed += 1
                print(f"[{completed}/{total}] {segment.get('id')} failed {teaching.get('error', '')[:80]}")

    logger.info("done. success=%d failed=%d", total - failed, failed)


def _resolve_clip_path(segment: dict[str, Any], clips_dir: Path) -> Path:
    clip_url = segment.get("clip_url") or ""
    if clip_url:
        name = Path(clip_url).name
        if name:
            return clips_dir / name
    return clips_dir / f"{segment['id']}.mp4"


def _save_lesson(path: Path, lesson: dict[str, Any]) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as file:
        json.dump(lesson, file, ensure_ascii=False, indent=2)
    os.replace(tmp_path, path)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate teaching content for a lesson")
    parser.add_argument("lesson_json", help="Path to the lesson JSON file")
    parser.add_argument("--clips-dir", default=None, help="Directory containing segment clips")
    parser.add_argument("--force", action="store_true", help="Regenerate even if teaching is ready")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable debug logging")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    try:
        generate_teaching_for_lesson(
            lesson_json_path=args.lesson_json,
            clips_dir=args.clips_dir,
            force=args.force,
        )
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001
        logger.exception("fatal error")
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
