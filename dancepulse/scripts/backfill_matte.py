"""
为 lesson 的每个 segment 生成 RVM matte (rgb + mask)。
同时回填 lesson JSON 里 segment 的 matte_rgb_url / matte_mask_url。

用法:
    python scripts/backfill_matte.py                     # 所有 lesson
    python scripts/backfill_matte.py <lesson_id>         # 指定
    python scripts/backfill_matte.py <lesson_id> <seg>   # 只处理 1 段
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline.matte_export import export_matte  # noqa: E402

LESSONS_DIR = ROOT / "backend" / "data" / "lessons"
CLIPS_DIR = ROOT / "backend" / "data" / "clips"
MATTE_DIR = ROOT / "backend" / "data" / "matte"


def backfill_lesson(lesson_path: Path, only_seg: str | None = None) -> int:
    lesson = json.loads(lesson_path.read_text(encoding="utf-8"))
    lesson_id = lesson["id"]
    segments = lesson.get("segments", [])
    if not segments:
        print(f"[skip] {lesson_id}: 没有 segments")
        return 0

    out_dir = MATTE_DIR / lesson_id
    out_dir.mkdir(parents=True, exist_ok=True)
    done = 0

    for seg in segments:
        seg_id = seg["id"]
        if only_seg and seg_id != only_seg:
            continue

        clip_name = Path(seg["clip_url"]).name  # e.g. les_xxx_seg_000.mp4
        clip_path = CLIPS_DIR / clip_name
        if not clip_path.exists():
            print(f"[skip] {lesson_id}/{seg_id}: clip 文件不存在 {clip_path}")
            continue

        rgb_out = out_dir / f"{seg_id}_rgb.mp4"
        mask_out = out_dir / f"{seg_id}_mask.mp4"

        if rgb_out.exists() and mask_out.exists() and seg.get("matte_rgb_url") and seg.get("matte_mask_url"):
            print(f"[skip] {lesson_id}/{seg_id}: 已有 matte")
            continue

        print(f"[run]  {lesson_id}/{seg_id}")
        t0 = time.time()
        try:
            export_matte(clip_path, rgb_out, mask_out, downsample_ratio=0.25, verbose=False)
        except Exception as e:
            print(f"[err]  {lesson_id}/{seg_id}: {e}")
            continue

        seg["matte_rgb_url"] = f"/matte/{lesson_id}/{seg_id}_rgb.mp4"
        seg["matte_mask_url"] = f"/matte/{lesson_id}/{seg_id}_mask.mp4"
        print(f"       ✓ {time.time() - t0:.1f}s")
        done += 1

    if done > 0:
        lesson_path.write_text(
            json.dumps(lesson, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"[save] {lesson_id}: 更新 {done} 个 segment 的 matte_*_url")

    return done


def main() -> int:
    target_lesson = sys.argv[1] if len(sys.argv) > 1 else None
    target_seg = sys.argv[2] if len(sys.argv) > 2 else None

    if target_lesson:
        paths = [LESSONS_DIR / f"{target_lesson}.json"]
    else:
        paths = sorted(LESSONS_DIR.glob("*.json"))

    total_done = 0
    for p in paths:
        if not p.exists():
            print(f"[miss] {p.name}")
            continue
        total_done += backfill_lesson(p, target_seg)

    print(f"\n完成: 处理 {total_done} 个 segment")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
