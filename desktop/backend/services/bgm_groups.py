"""BGM 音频指纹:判断两门课是否同一支舞(同一首歌)。

标题不可靠(同一舞蹈的导入标题千差万别),改用音频本身。
算法(在本机 12 门课上实测验证过分离度):
  1. imageio_ffmpeg 解出全长单声道音频(librosa 直接读 mp4 在本机无后端)
  2. chroma_cqt 逐维 z 归一化 → 不同歌的期望相关趋近 0
  3. 全滞后互相关(容忍两支视频从歌曲不同位置开始),取最大平均帧相关
  4. >= 阈值(0.90,高精度档)→ 并查集合并为同一组

实测:同曲不同录制 0.90-0.96,不同曲最高 ~0.88(harry 与他曲),
0.90 阈值下无误合并。结果缓存 data/dance_groups.json,课程集合变化自动重算。
"""

from __future__ import annotations

import hashlib
import json
import logging
import subprocess
import tempfile
import threading
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
LESSONS_DIR = DATA_DIR / "lessons"
VIDEOS_DIR = DATA_DIR / "videos"
CACHE_PATH = DATA_DIR / "dance_groups.json"

# ~93ms/帧;40s 音频约 430 帧,互相关成本可控
_HOP = 2048
_SR = 22050
_MAX_ANALYZE_SEC = 60.0
# 最短重叠 80 帧(~7.5s)才计相关
_MIN_OVERLAP = 80
# 同曲阈值:实测同曲 >=0.90,不同曲 <=0.88
_SAME_SONG_THRESHOLD = 0.90

_lock = threading.Lock()
_running = False


def _ffmpeg_exe() -> str | None:
    try:
        import imageio_ffmpeg  # noqa: PLC0415

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        import shutil  # noqa: PLC0415

        return shutil.which("ffmpeg")


def _lesson_video_path(lesson: dict) -> Path | None:
    vid = lesson.get("id", "")
    for ext in (".mp4", ".webm", ".mov", ".m4v"):
        p = VIDEOS_DIR / f"{vid}{ext}"
        if p.exists():
            return p
    return None


def _catalog_signature(paths: list[Path]) -> str:
    parts = sorted(f"{p.name}:{int(p.stat().st_mtime)}" for p in paths)
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def _extract_fingerprint(video_path: Path, ffmpeg: str) -> np.ndarray | None:
    """z 归一化 chroma:(12, T)。"""
    try:
        import librosa  # noqa: PLC0415

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            wav = tmp.name
        try:
            subprocess.run(
                [ffmpeg, "-y", "-loglevel", "error", "-i", str(video_path),
                 "-vn", "-ac", "1", "-ar", str(_SR), "-t", str(_MAX_ANALYZE_SEC),
                 "-f", "wav", wav],
                check=True, capture_output=True,
            )
            y, sr = librosa.load(wav, sr=_SR, mono=True)
        finally:
            Path(wav).unlink(missing_ok=True)

        if y.size < sr * 3:
            return None
        c = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=_HOP)
        return (c - c.mean(axis=1, keepdims=True)) / (c.std(axis=1, keepdims=True) + 1e-6)
    except Exception as exc:  # noqa: BLE001
        logger.warning("BGM 指纹提取失败 %s: %s", video_path.name, exc)
        return None


def _similarity(a: np.ndarray, b: np.ndarray) -> float:
    """全滞后互相关,取最大平均帧相关(12 维 z 归一化 → 满相关≈1)。"""
    best = 0.0
    la, lb = a.shape[1], b.shape[1]
    for lag in range(-(lb - _MIN_OVERLAP), la - _MIN_OVERLAP):
        if lag >= 0:
            a_seg, b_seg = a[:, lag:], b
        else:
            a_seg, b_seg = a, b[:, -lag:]
        n = min(a_seg.shape[1], b_seg.shape[1])
        if n < _MIN_OVERLAP:
            continue
        r = float(np.mean(np.sum(a_seg[:, :n] * b_seg[:, :n], axis=0)) / 12)
        best = max(best, r)
    return best


def _compute_groups() -> dict:
    ffmpeg = _ffmpeg_exe()
    lessons = []
    for f in LESSONS_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        video = _lesson_video_path(data)
        if video is not None:
            lessons.append((data["id"], video))

    signature = _catalog_signature([v for _, v in lessons])
    if CACHE_PATH.exists():
        try:
            cached = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
            if cached.get("signature") == signature:
                return cached
        except Exception:  # noqa: BLE001
            pass

    if ffmpeg is None:
        logger.warning("BGM 分组跳过:找不到 ffmpeg")
        return {"signature": signature, "groups": {}, "similarities": {}}

    logger.info("BGM 分组重算:%d 门课", len(lessons))
    fps: dict[str, np.ndarray] = {}
    for lid, video in lessons:
        fp = _extract_fingerprint(video, ffmpeg)
        if fp is not None:
            fps[lid] = fp

    ids = list(fps.keys())
    parent = {i: i for i in ids}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    pair_sims: dict[str, float] = {}
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            sim = _similarity(fps[a], fps[b])
            pair_sims[f"{a}|{b}"] = round(sim, 4)
            if sim >= _SAME_SONG_THRESHOLD:
                parent[find(a)] = find(b)

    groups: dict[str, str] = {}
    for lid in ids:
        root = find(lid)
        groups[lid] = f"bgm_{hashlib.sha256(root.encode()).hexdigest()[:8]}"

    result = {"signature": signature, "groups": groups, "similarities": pair_sims}
    CACHE_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("BGM 分组完成:%s", groups)
    return result


def get_dance_groups() -> dict[str, str]:
    """lessonId -> bgm 组键。只读缓存,不触发计算(计算走后台)。"""
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8")).get("groups", {})
        except Exception:  # noqa: BLE001
            return {}
    return {}


def refresh_dance_groups_async() -> None:
    """后台线程重算分组(幂等:已有线程在跑就跳过)。"""
    global _running

    def _run() -> None:
        global _running
        try:
            _compute_groups()
        except Exception as exc:  # noqa: BLE001
            logger.warning("BGM 分组计算失败: %s", exc)
        finally:
            with _lock:
                _running = False

    with _lock:
        if _running:
            return
        _running = True
    threading.Thread(target=_run, name="bgm-group-worker", daemon=True).start()
