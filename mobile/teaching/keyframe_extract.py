"""
从切片 MP4 中按时间均匀抽取关键帧，返回 base64 编码。

对 VLM 来说，4 张按 beat 顺序排列的关键帧足够表达一个 8 拍切片的动作脉络。
"""

from __future__ import annotations

import base64
import logging
import re
import subprocess
import tempfile
from pathlib import Path
from typing import List

import cv2

logger = logging.getLogger(__name__)

# 关键帧 JPEG 质量。85 是质量 / 体积的经验甜点。
_JPEG_QUALITY = 85


def extract_keyframes_base64(
    clip_path: str,
    n_frames: int = 4,
) -> List[str]:
    """
    按时间均匀从一个 clip 中抽取 n 张关键帧，返回 base64 JPEG 列表。

    Args:
        clip_path: 切片 MP4 路径
        n_frames: 抽取帧数，默认 4

    Returns:
        base64 编码的 JPEG 字符串列表，长度为 n_frames

    Raises:
        FileNotFoundError: 文件不存在
        RuntimeError: 视频完全无法读取（0 帧或 open 失败）
    """
    clip_file = Path(clip_path)
    if not clip_file.exists():
        raise FileNotFoundError(f"clip not found: {clip_path}")

    try:
        return _extract_with_opencv(clip_file, n_frames)
    except RuntimeError as exc:
        logger.warning(
            "OpenCV extraction failed for %s, falling back to ffmpeg: %s",
            clip_path,
            exc,
        )
        try:
            return _extract_with_ffmpeg(clip_file, n_frames)
        except RuntimeError as fallback_exc:
            raise RuntimeError(
                f"opencv failed: {exc}; ffmpeg fallback failed: {fallback_exc}"
            ) from fallback_exc


def _extract_with_opencv(clip_file: Path, n_frames: int) -> List[str]:
    cap = cv2.VideoCapture(str(clip_file))
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {clip_file}")

    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

        if total_frames <= 0:
            raise RuntimeError(f"video has 0 frames: {clip_file}")

        # 均匀采样帧索引
        # 例如 total=240, n=4 -> [30, 90, 150, 210]
        # 两端留出 1/(2n) 的边距，避开黑边或转场
        indices = _uniform_indices(total_frames, n_frames)

        frames_b64: List[str] = []
        last_valid_b64: str | None = None

        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()

            if not ok or frame is None:
                # 降级：重复上一张合法帧，避免整个 segment 失败
                if last_valid_b64 is not None:
                    logger.warning(
                        "frame %d unreadable in %s, reusing previous frame",
                        idx, clip_file,
                    )
                    frames_b64.append(last_valid_b64)
                    continue
                # 连首帧都读不到 —— 这个视频基本废了
                raise RuntimeError(
                    f"cannot read any frame from {clip_file} (fps={fps}, total={total_frames})"
                )

            b64 = _encode_frame_jpeg_base64(frame)
            frames_b64.append(b64)
            last_valid_b64 = b64

        return frames_b64
    finally:
        cap.release()


def _extract_with_ffmpeg(clip_file: Path, n_frames: int) -> List[str]:
    duration_seconds = _probe_duration_seconds(clip_file)
    if duration_seconds <= 0:
        raise RuntimeError(f"invalid duration for {clip_file}: {duration_seconds}")

    timestamps = _uniform_timestamps(duration_seconds, n_frames)
    frames_b64: List[str] = []
    last_valid_b64: str | None = None

    with tempfile.TemporaryDirectory(prefix="dp-keyframes-") as temp_dir:
        for index, timestamp in enumerate(timestamps):
            frame_path = Path(temp_dir) / f"frame_{index:02d}.jpg"
            cmd = [
                "ffmpeg",
                "-v",
                "error",
                "-ss",
                f"{timestamp:.3f}",
                "-i",
                str(clip_file),
                "-frames:v",
                "1",
                "-q:v",
                "2",
                "-y",
                str(frame_path),
            ]
            result = subprocess.run(
                cmd,
                check=False,
                capture_output=True,
                text=True,
            )

            if result.returncode != 0 or not frame_path.exists():
                if last_valid_b64 is not None:
                    logger.warning(
                        "ffmpeg could not extract frame %.3fs from %s, reusing previous frame",
                        timestamp,
                        clip_file,
                    )
                    frames_b64.append(last_valid_b64)
                    continue
                raise RuntimeError(
                    "ffmpeg could not extract frame "
                    f"{timestamp:.3f}s from {clip_file}: {result.stderr.strip()[:240]}"
                )

            b64 = base64.b64encode(frame_path.read_bytes()).decode("ascii")
            frames_b64.append(b64)
            last_valid_b64 = b64

    return frames_b64


def _uniform_indices(total_frames: int, n: int) -> List[int]:
    """
    在 [0, total_frames) 上取 n 个均匀分布的整数索引。
    两端各留 1/(2n) 的边距。
    """
    if n <= 0:
        return []
    if n == 1:
        return [total_frames // 2]

    # 均匀采样点：中心对齐
    step = total_frames / n
    indices = [int(step * (i + 0.5)) for i in range(n)]
    # clamp 到合法区间
    return [max(0, min(total_frames - 1, i)) for i in indices]


def _uniform_timestamps(duration_seconds: float, n: int) -> List[float]:
    """在 [0, duration] 上均匀取 n 个时间点，避开最后一帧边界。"""
    if n <= 0:
        return []
    if n == 1:
        return [max(0.0, duration_seconds / 2)]

    step = duration_seconds / n
    end_cap = max(duration_seconds - 0.05, 0.0)
    return [max(0.0, min(end_cap, step * (i + 0.5))) for i in range(n)]


def _probe_duration_seconds(clip_file: Path) -> float:
    """
    用 ffmpeg 输出里的 Duration 字段探测时长。

    当前运行环境有 ffmpeg，但不保证有 ffprobe；这里避免额外依赖。
    """
    try:
        result = subprocess.run(
            ["ffmpeg", "-i", str(clip_file)],
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg not available") from exc

    output = f"{result.stdout}\n{result.stderr}"
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", output)
    if not match:
        raise RuntimeError(f"unable to probe duration for {clip_file}")

    hours = int(match.group(1))
    minutes = int(match.group(2))
    seconds = float(match.group(3))
    return hours * 3600 + minutes * 60 + seconds


def _encode_frame_jpeg_base64(frame) -> str:
    """把 BGR numpy 帧编码为 base64 JPEG 字符串（不带 data: 前缀）。"""
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, _JPEG_QUALITY])
    if not ok:
        raise RuntimeError("cv2.imencode failed")
    return base64.b64encode(buf.tobytes()).decode("ascii")
