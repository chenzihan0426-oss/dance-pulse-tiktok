"""
用 ffmpeg 导出单个 segment 的 MP4 和缩略图。

对外函数:
- export_clip(video_path, start, end, out_path)
- export_thumbnail(video_path, at, out_path)
- re_export_clip(video_path, segment_id, start, end) -> (clip_path, thumb_path)
  M2 在 PATCH segments 后直接调用,无需 M1 重跑 pipeline
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Tuple

from . import config
from .utils import posix


def export_clip(
    video_path: str | Path,
    start: float,
    end: float,
    out_path: str | Path,
) -> Path:
    """
    切出 [start, end) 区间的 MP4。重编码以保证切点精确。
    """
    start = max(0.0, float(start))
    end = float(end)
    duration = max(0.05, end - start)

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # -ss 放在 -i 后面 = 精确 seek(慢但准);-ss 放前面 = 关键帧 seek(快但不准)
    # 我们优先准确性,重编码 + 精确 seek
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(video_path),
        "-ss", f"{start:.3f}",
        "-t", f"{duration:.3f}",
        "-c:v", config.CLIP_VCODEC,
        "-crf", config.CLIP_CRF,
        "-preset", config.CLIP_PRESET,
        "-c:a", config.CLIP_ACODEC,
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        str(out_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return out_path


def export_thumbnail(
    video_path: str | Path,
    at: float,
    out_path: str | Path,
) -> Path:
    """
    在视频 at 秒处抽一帧做缩略图(JPG)。取区间中点最稳定。
    """
    at = max(0.0, float(at))
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-ss", f"{at:.3f}",
        "-i", str(video_path),
        "-frames:v", "1",
        "-q:v", config.THUMB_QUALITY,
        str(out_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return out_path


def export_segment_assets(
    video_path: str | Path,
    segment_id: str,
    start: float,
    end: float,
    clips_dir: Path | None = None,
    thumbs_dir: Path | None = None,
) -> Tuple[Path, Path]:
    """
    一口气导出 clip + thumbnail,返回 (clip_path, thumb_path)。
    缩略图取 segment 时间中点。
    """
    clips_dir = clips_dir or config.CLIPS_DIR
    thumbs_dir = thumbs_dir or config.THUMBS_DIR

    clip_path = Path(clips_dir) / f"{segment_id}.mp4"
    thumb_path = Path(thumbs_dir) / f"{segment_id}.jpg"

    mid = (start + end) / 2.0
    export_clip(video_path, start, end, clip_path)
    export_thumbnail(video_path, mid, thumb_path)

    return clip_path, thumb_path


# ---------------------------------------------------------------------------
# 对外签名:供 M2 在 PATCH segments 后调用
# ---------------------------------------------------------------------------

def re_export_clip(
    video_path: str,
    segment_id: str,
    start: float,
    end: float,
) -> Tuple[str, str]:
    """
    M2 PATCH segments 后调用。重切单个 segment,覆盖已有文件。

    返回相对 URL(与 Lesson JSON 里的 clip_url / thumbnail 字段一致)。
    """
    clip_path, thumb_path = export_segment_assets(
        video_path=video_path,
        segment_id=segment_id,
        start=start,
        end=end,
    )

    clip_url = f"{config.URL_CLIPS_PREFIX}/{clip_path.name}"
    thumb_url = f"{config.URL_THUMBS_PREFIX}/{thumb_path.name}"

    return posix(clip_url), posix(thumb_url)
