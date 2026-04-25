"""
为已经存在的 lesson 回填老师骨架时序。

用法:
    python scripts/backfill_pose.py              # 所有 lesson
    python scripts/backfill_pose.py <lesson_id>  # 指定一支

不会重切分、不会重导出 MP4,只跑 pose → 按 segment 的 start/end 切片 → 写
backend/data/pose/{lesson_id}/{seg_id}.json,并给 lesson.segments[*].pose_url 赋值。
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline import config  # noqa: E402
from pipeline.pose_energy import compute_pose_full  # noqa: E402
from pipeline.pose_export import export_segment_pose  # noqa: E402


LESSONS_DIR = ROOT / "backend" / "data" / "lessons"
VIDEOS_DIR = ROOT / "backend" / "data" / "videos"
POSE_DIR = ROOT / "backend" / "data" / "pose"


def backfill_one(lesson_path: Path) -> bool:
    lesson = json.loads(lesson_path.read_text(encoding="utf-8"))
    lesson_id = lesson["id"]
    segments = lesson.get("segments", [])
    if not segments:
        print(f"[skip] {lesson_id}: 没有 segments")
        return False

    # 找原始视频
    video_url = lesson.get("video_url", "")
    video_name = video_url.rsplit("/", 1)[-1] if video_url else f"{lesson_id}.mp4"
    video_path = VIDEOS_DIR / video_name
    if not video_path.exists():
        alt = VIDEOS_DIR / f"{lesson_id}.mp4"
        if alt.exists():
            video_path = alt
        else:
            print(f"[skip] {lesson_id}: 找不到视频 {video_path}")
            return False

    # 已全部 backfill 过就跳过
    pose_root = POSE_DIR / lesson_id
    all_done = pose_root.exists() and all(
        (pose_root / f"{seg['id']}.json").exists() for seg in segments
    )
    if all_done and all(seg.get("pose_url") for seg in segments):
        print(f"[skip] {lesson_id}: 已有完整 pose")
        return False

    print(f"[run]  {lesson_id}: 跑 pose on {video_path.name} ...")
    t0 = time.time()
    ts, _energies, landmarks = compute_pose_full(str(video_path))
    print(f"       采样 {len(ts)} 帧,用时 {time.time() - t0:.1f}s")

    for seg in segments:
        pose_path = export_segment_pose(
            lesson_id=lesson_id,
            segment_id=seg["id"],
            start=float(seg["start"]),
            end=float(seg["end"]),
            timestamps=ts,
            landmarks=landmarks,
            fps=config.POSE_SAMPLE_FPS,
            output_dir=POSE_DIR,
        )
        seg["pose_url"] = f"/pose/{lesson_id}/{pose_path.name}"

    lesson_path.write_text(
        json.dumps(lesson, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"       ✓ 写入 {len(segments)} 个 segment pose,更新 {lesson_path.name}")
    return True


def main() -> int:
    target = sys.argv[1] if len(sys.argv) > 1 else None

    if target:
        candidates = [LESSONS_DIR / f"{target}.json"]
    else:
        candidates = sorted(LESSONS_DIR.glob("*.json"))

    total = len(candidates)
    done = 0
    for p in candidates:
        if not p.exists():
            print(f"[miss] {p.name}")
            continue
        try:
            if backfill_one(p):
                done += 1
        except Exception as e:
            print(f"[err]  {p.name}: {e}")

    print(f"\n完成: {done}/{total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
