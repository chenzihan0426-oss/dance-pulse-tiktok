"""
M1 Pipeline 入口。

CLI:
    python run.py <video_path> --output <json_path>

对外 Python 函数:
    process_video(video_path, output_dir) -> dict
    re_export_clip(video_path, segment_id, start, end) -> (clip_path, thumb_path)

流程:
    1. ffmpeg 抽音频
    2. librosa 节拍检测
    3. librosa 段落检测(先默认 label)
    4. MediaPipe Pose 动能曲线
    5. 基于 section 能量重打 chorus/verse 标签
    6. build_segments 融合成 segment 列表
    7. 为每个 segment 导出 MP4 + 缩略图,回填 clip_url / thumbnail
    8. 校验 beat 对齐
    9. 写 Lesson JSON
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# 支持 `python run.py ...` 从 pipeline/ 目录里直接跑,也支持作为包导入
if __package__ is None or __package__ == "":
    # 作为脚本直接执行时,把父目录加进 sys.path,再以包方式 import
    _here = Path(__file__).resolve().parent
    sys.path.insert(0, str(_here.parent))
    __package__ = "pipeline"

from pipeline import config
from pipeline.beat_detection import (
    detect_beats,
    detect_sections,
    extract_audio,
    _assign_semantic_labels,
)
from pipeline.clip_export import (
    export_segment_assets,
    re_export_clip as _re_export_clip,
)
from pipeline.pose_energy import compute_pose_full
from pipeline.pose_export import export_segment_pose
from pipeline.segment_fusion import (
    build_segments,
    compute_section_energies,
)
from pipeline.utils import (
    is_on_beat,
    posix,
    round2,
    safe_slug,
)


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def process_video(video_path: str, output_dir: str) -> dict:
    """
    端到端跑完 M1 pipeline,返回 Lesson dict。

    参数:
        video_path: 输入 MP4 路径
        output_dir: backend/data 目录根。会在其下创建 clips/ 和 thumbs/

    产物:
        output_dir/clips/seg_XXX.mp4
        output_dir/thumbs/seg_XXX.jpg
        返回的 Lesson dict(调用方自行决定是否落盘到 lessons/)
    """
    video_path = str(Path(video_path).resolve())
    output_dir = Path(output_dir)
    clips_dir = output_dir / "clips"
    thumbs_dir = output_dir / "thumbs"
    pose_dir = output_dir / "pose"
    clips_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    pose_dir.mkdir(parents=True, exist_ok=True)

    title = Path(video_path).stem
    lesson_id = safe_slug(title)

    t0 = time.time()
    print(f"[M1] 处理视频: {video_path}")

    # Step 1 - 2: 音频 + beat
    print("[M1] 1/7 抽音频 + 节拍检测 ...")
    sr, y = extract_audio(video_path)
    duration_audio = float(len(y)) / sr
    bpm, beats = detect_beats(y, sr)
    beats_rounded = [round2(b) for b in beats]
    print(f"[M1]     BPM ≈ {bpm:.1f},共 {len(beats_rounded)} 个 beat")

    # 视频实际时长(取 audio 与 container 的较小值)
    video_duration = _probe_duration(video_path, fallback=duration_audio)
    duration = round2(min(video_duration, beats_rounded[-1] if beats_rounded else video_duration))
    # 但 lesson.duration 应是视频总时长,不能裁到最后一个 beat
    duration = round2(video_duration)

    # Step 3: 先做无语义的段落划分
    print("[M1] 2/7 段落检测 ...")
    sections = detect_sections(y, sr, duration=duration, k=config.SECTION_K_DEFAULT)
    print(f"[M1]     {len(sections)} 段")

    # Step 4: pose 动能 + 关键点时序(同一次抽帧,一次算两个产物)
    print("[M1] 3/7 Pose 动能曲线 ...")
    pose_ts, pose_e, pose_landmarks = compute_pose_full(video_path)
    print(f"[M1]     采样 {len(pose_ts)} 帧,覆盖 {pose_ts[-1] if pose_ts else 0:.1f}s")

    # Step 5: 用 section 能量重打 chorus/verse 标签
    print("[M1] 4/7 段落语义标签 ...")
    section_energies = compute_section_energies(sections, pose_ts, pose_e)
    _assign_semantic_labels(sections, section_energies)

    # Step 6: 融合成 segments
    print("[M1] 5/7 按 8 拍切 segment ...")
    segments = build_segments(
        lesson_id=lesson_id,
        beats=beats_rounded,
        sections=sections,
        pose_timestamps=pose_ts,
        pose_energies=pose_e,
        beat_unit=config.BEAT_UNITS_PER_SEGMENT,
    )
    print(f"[M1]     生成 {len(segments)} 个候选 segment")

    # Step 7: 导出每个 segment 的 clip / 缩略图 / 骨架时序
    print("[M1] 6/7 导出切片 MP4 + 缩略图 + 骨架时序 ...")
    for i, seg in enumerate(segments):
        clip_path, thumb_path = export_segment_assets(
            video_path=video_path,
            segment_id=seg["id"],
            start=seg["start"],
            end=seg["end"],
            clips_dir=clips_dir,
            thumbs_dir=thumbs_dir,
        )
        seg["clip_url"] = posix(f"{config.URL_CLIPS_PREFIX}/{clip_path.name}")
        seg["thumbnail"] = posix(f"{config.URL_THUMBS_PREFIX}/{thumb_path.name}")

        # 老师骨架时序(Step 5 跟拍叠加要用)
        pose_path = export_segment_pose(
            lesson_id=lesson_id,
            segment_id=seg["id"],
            start=seg["start"],
            end=seg["end"],
            timestamps=pose_ts,
            landmarks=pose_landmarks,
            fps=config.POSE_SAMPLE_FPS,
            output_dir=pose_dir,
        )
        # pose JSON 放在 /pose/{lesson_id}/{seg_id}.json
        seg["pose_url"] = posix(f"/pose/{lesson_id}/{pose_path.name}")

        if (i + 1) % 5 == 0 or i == len(segments) - 1:
            print(f"[M1]     {i + 1}/{len(segments)} 切片完成")

    # Step 8: 校验 beat 对齐
    print("[M1] 7/7 校验 beat 对齐 ...")
    _validate_beat_alignment(segments, beats_rounded)

    # Lesson JSON 组装
    lesson = {
        "id": lesson_id,
        "title": title,
        "source_url": "",
        "duration": round2(duration),
        "bpm": round2(bpm),
        "video_url": posix(f"{config.URL_VIDEOS_PREFIX}/{Path(video_path).name}"),
        "thumbnail": segments[0]["thumbnail"] if segments else "",
        "confirmed": False,
        "beats": beats_rounded,
        "sections": sections,
        "segments": segments,
    }

    elapsed = time.time() - t0
    print(f"[M1] 完成,用时 {elapsed:.1f}s")
    return lesson


def re_export_clip(
    video_path: str,
    segment_id: str,
    start: float,
    end: float,
) -> tuple[str, str]:
    """
    供 M2 在 PATCH segments 后调用。薄封装 clip_export.re_export_clip。

    返回 (clip_url, thumb_url),两者都是相对 URL。
    """
    return _re_export_clip(video_path, segment_id, start, end)


# ---------------------------------------------------------------------------
# 辅助
# ---------------------------------------------------------------------------

def _probe_duration(video_path: str, fallback: float = 0.0) -> float:
    """用 ffprobe 取视频时长,失败返回 fallback。"""
    import subprocess
    try:
        out = subprocess.check_output(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                video_path,
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        return float(out)
    except Exception:
        return float(fallback)


def _validate_beat_alignment(segments: list, beats: list) -> None:
    """
    打印 beat 对齐比例。不抛异常 —— 外层负责是否因比例过低阻断。
    """
    if not segments:
        print("[M1][warn] 没有 segment 产出")
        return
    beat_set = set(beats)
    aligned = 0
    for seg in segments:
        start_ok = seg["start"] in beat_set
        end_ok = seg["end"] in beat_set
        if start_ok and end_ok:
            aligned += 1
    total = len(segments)
    ratio = aligned / total if total else 0.0
    print(f"[M1]     beat 对齐比例: {aligned}/{total} = {ratio:.1%}")
    if ratio < 0.85:
        print(f"[M1][warn] beat 对齐比例低于 85%,建议检查音频节拍稳定性")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        prog="m1-pipeline",
        description="舞拍 M1:K-pop 编舞视频自动拆片",
    )
    parser.add_argument("video_path", help="输入视频路径(MP4)")
    parser.add_argument(
        "--output",
        required=True,
        help="Lesson JSON 输出路径,e.g. backend/data/lessons/antifragile.json",
    )
    parser.add_argument(
        "--data-dir",
        default=None,
        help="backend/data 根目录。不传则从 --output 推断。",
    )
    args = parser.parse_args()

    output_path = Path(args.output)
    if args.data_dir:
        data_dir = Path(args.data_dir)
    else:
        # 假设 output 形如 backend/data/lessons/xxx.json → data_dir = backend/data
        if output_path.parent.name == "lessons":
            data_dir = output_path.parent.parent
        else:
            data_dir = output_path.parent

    lesson = process_video(args.video_path, str(data_dir))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(lesson, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[M1] Lesson JSON 已写入: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
