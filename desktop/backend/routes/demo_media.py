from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from fastapi import APIRouter

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
VIDEOS_DIR = DATA_DIR / "videos"
THUMBS_DIR = DATA_DIR / "thumbs"

VIDEO_EXTS = {".mp4", ".webm", ".mov", ".mkv"}
THUMB_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# 每个视频自动抽几帧（相对时长百分比），文件名: {stem}_f00.jpg …
FRAME_PERCENTS = (8, 28, 52, 76)

router = APIRouter(prefix="/api", tags=["demo-media"])


def _list_media(subdir: str, exts: set[str], url_prefix: str) -> list[str]:
    folder = DATA_DIR / subdir
    folder.mkdir(parents=True, exist_ok=True)
    files = [
        path
        for path in folder.iterdir()
        if path.is_file() and path.suffix.lower() in exts and path.name != ".gitkeep"
    ]
    files.sort(key=lambda p: p.name.lower())
    return [f"{url_prefix}/{path.name}" for path in files]


def _ffmpeg_bin() -> str | None:
    return shutil.which("ffmpeg")


def _probe_duration_seconds(video: Path) -> float | None:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    try:
        completed = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(video),
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=20,
        )
        if completed.returncode != 0:
            return None
        return float(completed.stdout.strip())
    except (ValueError, OSError, subprocess.TimeoutExpired):
        return None


def _ensure_frame_thumbs_for_video(video: Path, ffmpeg: str) -> None:
    """若缺少 {stem}_fXX.jpg，则按百分比抽帧写入 thumbs/。"""
    stem = video.stem
    missing = [
        i
        for i in range(len(FRAME_PERCENTS))
        if not (THUMBS_DIR / f"{stem}_f{i:02d}.jpg").exists()
    ]
    if not missing:
        return

    duration = _probe_duration_seconds(video)
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)

    for i in missing:
        pct = FRAME_PERCENTS[i]
        out = THUMBS_DIR / f"{stem}_f{i:02d}.jpg"
        if duration and duration > 1.5:
            ss = max(0.2, min(duration - 0.35, duration * (pct / 100.0)))
            seek_args = ["-ss", f"{ss:.3f}"]
        else:
            # 无时长时按秒硬跳（短视频也能出图）
            seek_args = ["-ss", str(max(0.3, i * 1.2))]

        try:
            subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    *seek_args,
                    "-i",
                    str(video),
                    "-frames:v",
                    "1",
                    "-q:v",
                    "3",
                    "-update",
                    "1",
                    str(out),
                ],
                capture_output=True,
                check=False,
                timeout=40,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue


def ensure_demo_frame_thumbs() -> None:
    """扫描 videos/，为每个视频补齐多帧封面（已有则跳过）。"""
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)
    ffmpeg = _ffmpeg_bin()
    if not ffmpeg:
        return
    for video in sorted(VIDEOS_DIR.iterdir(), key=lambda p: p.name.lower()):
        if not video.is_file() or video.suffix.lower() not in VIDEO_EXTS:
            continue
        if video.name == ".gitkeep":
            continue
        _ensure_frame_thumbs_for_video(video, ffmpeg)


@router.get("/demo-media")
def get_demo_media() -> dict[str, list[str]]:
    """扫描本机 data/videos 与 data/thumbs；缺封面时自动从视频抽帧。"""
    ensure_demo_frame_thumbs()
    return {
        "videos": _list_media("videos", VIDEO_EXTS, "/videos"),
        "thumbs": _list_media("thumbs", THUMB_EXTS, "/thumbs"),
    }
