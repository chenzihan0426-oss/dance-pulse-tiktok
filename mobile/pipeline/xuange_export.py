"""
轩哥风格的 pose guide + particle 引导视频导出器。

对一段 clip 做两件事:
  1) 用 pose_landmarker_full.task(33 点 full model)抽全帧关键点 → poses_full.json
  2) 基于 poses_full.json 渲染 Stepin 风格粒子引导视频 → particle.mp4

用法:
    python -m pipeline.xuange_export \
        --clip backend/data/clips/les_xxx_seg_000.mp4 \
        --lesson les_xxx --seg seg_000

产物:
    backend/data/pose_full/{lesson}/{seg}.json
    backend/data/particles/{lesson}/{seg}.mp4
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_pose_guide(clip: Path, out_dir: Path, prefix: str, seconds: float, model_path: Path) -> None:
    """调轩哥的 process_pose_guide 产出 poses.json + 一个 render 视频。我们只要 poses.json。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    script = ROOT / "pipeline" / "_xuange_pose_guide.py"
    cmd = [
        sys.executable,
        str(script),
        "--input", str(clip),
        "--out-dir", str(out_dir),
        "--prefix", prefix,
        "--seconds", str(seconds),
        "--model", str(model_path),
    ]
    subprocess.run(cmd, check=True)


def run_particles(poses_json: Path, out_dir: Path, prefix: str, seconds: float) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    script = ROOT / "pipeline" / "_xuange_particles.py"
    cmd = [
        sys.executable,
        str(script),
        "--poses", str(poses_json),
        "--out-dir", str(out_dir),
        "--prefix", prefix,
        "--seconds", str(seconds),
    ]
    subprocess.run(cmd, check=True)


def probe_seconds(clip: Path) -> float:
    import json as _json
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json", str(clip),
        ],
        capture_output=True, text=True, check=True,
    )
    return float(_json.loads(result.stdout)["format"]["duration"])


def export_for_segment(clip: Path, lesson_id: str, seg_id: str, seconds: float | None = None) -> dict:
    model_path = ROOT / "pipeline" / "models" / "pose_landmarker_full.task"
    if not model_path.exists():
        raise FileNotFoundError(f"模型未找到: {model_path}")

    seconds = seconds if seconds is not None else probe_seconds(clip)

    pose_tmp_dir = ROOT / "backend" / "data" / "_tmp_xuange" / f"{lesson_id}_{seg_id}"
    pose_prefix = f"{seg_id}_pose"
    run_pose_guide(clip, pose_tmp_dir, pose_prefix, seconds, model_path)

    poses_json_tmp = pose_tmp_dir / "poses.json"
    pose_full_dir = ROOT / "backend" / "data" / "pose_full" / lesson_id
    pose_full_dir.mkdir(parents=True, exist_ok=True)
    pose_full_target = pose_full_dir / f"{seg_id}.json"
    pose_full_target.write_bytes(poses_json_tmp.read_bytes())

    particles_dir = ROOT / "backend" / "data" / "particles" / lesson_id
    particles_tmp = particles_dir / "_tmp"
    run_particles(poses_json_tmp, particles_tmp, f"{seg_id}_particles", seconds)

    particle_video = particles_tmp / f"{seg_id}_particles.mp4"
    final_video = particles_dir / f"{seg_id}.mp4"
    final_video.write_bytes(particle_video.read_bytes())

    import shutil
    shutil.rmtree(pose_tmp_dir, ignore_errors=True)
    shutil.rmtree(particles_tmp, ignore_errors=True)

    return {
        "pose_full_url": f"/pose_full/{lesson_id}/{seg_id}.json",
        "particle_url": f"/particles/{lesson_id}/{seg_id}.mp4",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--clip", required=True)
    parser.add_argument("--lesson", required=True)
    parser.add_argument("--seg", required=True)
    parser.add_argument("--seconds", type=float, default=None)
    args = parser.parse_args()

    urls = export_for_segment(Path(args.clip), args.lesson, args.seg, args.seconds)
    print(f"pose_full_url = {urls['pose_full_url']}")
    print(f"particle_url  = {urls['particle_url']}")


if __name__ == "__main__":
    main()
