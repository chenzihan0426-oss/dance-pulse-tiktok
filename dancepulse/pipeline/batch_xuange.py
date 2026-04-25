"""
批量为所有 lesson 的所有 segment 跑 xuange_export (poses_full + particle)。

每次跑完一段就立即写回 lesson JSON 的 pose_full_url / particle_url 字段。
已处理过的 segment (产物文件存在) 会跳过。

用法:
    # 全部
    python -m pipeline.batch_xuange
    # 只处理一支
    python -m pipeline.batch_xuange --lesson les_xxx
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
POSE_FULL_DIR = ROOT / "backend" / "data" / "pose_full"
PARTICLES_DIR = ROOT / "backend" / "data" / "particles"


def process_lesson(lesson_path: Path, only_missing: bool = True) -> tuple[int, int, int]:
    """返回 (处理, 跳过, 失败) 数量。"""
    from pipeline.xuange_export import export_for_segment

    data = json.loads(lesson_path.read_text())
    lesson_id = data["id"]
    segments = data.get("segments", [])

    processed = 0
    skipped = 0
    failed = 0
    changed = False

    for seg in segments:
        if seg.get("deleted"):
            skipped += 1
            continue
        seg_id = seg["id"]

        pose_target = POSE_FULL_DIR / lesson_id / f"{seg_id}.json"
        particle_target = PARTICLES_DIR / lesson_id / f"{seg_id}.mp4"

        if only_missing and pose_target.exists() and particle_target.exists():
            if not seg.get("pose_full_url"):
                seg["pose_full_url"] = f"/pose_full/{lesson_id}/{seg_id}.json"
                changed = True
            if not seg.get("particle_url"):
                seg["particle_url"] = f"/particles/{lesson_id}/{seg_id}.mp4"
                changed = True
            skipped += 1
            continue

        clip_path = CLIPS_DIR / f"{lesson_id}_{seg_id}.mp4"
        if not clip_path.exists():
            print(f"  ! 缺 clip: {clip_path.name}, 跳过", flush=True)
            skipped += 1
            continue

        print(f"  > {lesson_id} / {seg_id} ({clip_path.name})", flush=True)
        try:
            urls = export_for_segment(clip_path, lesson_id, seg_id)
            seg["pose_full_url"] = urls["pose_full_url"]
            seg["particle_url"] = urls["particle_url"]
            changed = True
            processed += 1
        except Exception as exc:
            failed += 1
            print(f"    x 失败: {exc}", flush=True)
            traceback.print_exc()

    if changed:
        # 原子写: 先写 tmp, 再 rename 替换. 防止并发读时读到半截
        tmp = lesson_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        tmp.replace(lesson_path)

    return processed, skipped, failed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lesson", help="只处理某个 lesson id")
    parser.add_argument("--force", action="store_true", help="忽略已产出,重跑")
    args = parser.parse_args()

    lesson_files = sorted(LESSONS_DIR.glob("*.json"))
    if args.lesson:
        lesson_files = [p for p in lesson_files if p.stem == args.lesson]

    totals = [0, 0, 0]
    for i, p in enumerate(lesson_files):
        print(f"[{i+1}/{len(lesson_files)}] {p.stem}", flush=True)
        try:
            pr, sk, fa = process_lesson(p, only_missing=not args.force)
        except Exception as exc:
            print(f"  ! 加载 lesson 失败: {exc}", flush=True)
            continue
        totals[0] += pr
        totals[1] += sk
        totals[2] += fa
        print(f"    + 处理 {pr}, 跳过 {sk}, 失败 {fa}", flush=True)

    print(f"\n=== 汇总: 处理 {totals[0]}, 跳过 {totals[1]}, 失败 {totals[2]} ===", flush=True)


if __name__ == "__main__":
    sys.exit(main() or 0)
