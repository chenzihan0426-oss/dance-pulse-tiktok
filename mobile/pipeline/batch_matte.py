"""
批量跑 RVM matte: 对所有 lesson 的所有 segment 产出 {seg_id}_rgb.mp4 + {seg_id}_mask.mp4
并把 URL 写回 lesson JSON (matte_rgb_url / matte_mask_url)

用法:
    python -m pipeline.batch_matte
    python -m pipeline.batch_matte --lesson les_xxx
"""

from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LESSONS_DIR = ROOT / "backend" / "data" / "lessons"
CLIPS_DIR = ROOT / "backend" / "data" / "clips"
MATTE_DIR = ROOT / "backend" / "data" / "matte"


def process_lesson(lesson_path: Path) -> tuple[int, int, int]:
    from pipeline.matte_export import export_matte

    data = json.loads(lesson_path.read_text())
    lesson_id = data["id"]
    segments = data.get("segments", [])

    out_dir = MATTE_DIR / lesson_id
    out_dir.mkdir(parents=True, exist_ok=True)

    processed = 0
    skipped = 0
    failed = 0
    changed = False

    for seg in segments:
        if seg.get("deleted"):
            skipped += 1
            continue
        seg_id = seg["id"]
        rgb_out = out_dir / f"{seg_id}_rgb.mp4"
        mask_out = out_dir / f"{seg_id}_mask.mp4"

        if rgb_out.exists() and mask_out.exists():
            if not seg.get("matte_rgb_url"):
                seg["matte_rgb_url"] = f"/matte/{lesson_id}/{seg_id}_rgb.mp4"
                changed = True
            if not seg.get("matte_mask_url"):
                seg["matte_mask_url"] = f"/matte/{lesson_id}/{seg_id}_mask.mp4"
                changed = True
            skipped += 1
            continue

        clip = CLIPS_DIR / f"{lesson_id}_{seg_id}.mp4"
        if not clip.exists():
            skipped += 1
            continue

        print(f"  > {lesson_id} / {seg_id}", flush=True)
        try:
            export_matte(clip, rgb_out, mask_out, downsample_ratio=0.25)
            seg["matte_rgb_url"] = f"/matte/{lesson_id}/{seg_id}_rgb.mp4"
            seg["matte_mask_url"] = f"/matte/{lesson_id}/{seg_id}_mask.mp4"
            changed = True
            processed += 1
        except Exception as exc:
            failed += 1
            print(f"    x 失败: {exc}", flush=True)
            traceback.print_exc()

    if changed:
        tmp = lesson_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        tmp.replace(lesson_path)

    return processed, skipped, failed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lesson", help="只处理一支 lesson")
    args = parser.parse_args()

    lesson_files = sorted(LESSONS_DIR.glob("*.json"))
    if args.lesson:
        lesson_files = [p for p in lesson_files if p.stem == args.lesson]

    totals = [0, 0, 0]
    for i, p in enumerate(lesson_files):
        print(f"[{i+1}/{len(lesson_files)}] {p.stem}", flush=True)
        try:
            pr, sk, fa = process_lesson(p)
        except Exception as exc:
            print(f"  ! 加载失败: {exc}", flush=True)
            continue
        totals[0] += pr
        totals[1] += sk
        totals[2] += fa
        print(f"    + 处理 {pr}, 跳过 {sk}, 失败 {fa}", flush=True)

    print(f"\n=== matte 汇总: 处理 {totals[0]}, 跳过 {totals[1]}, 失败 {totals[2]} ===", flush=True)


if __name__ == "__main__":
    sys.exit(main() or 0)
