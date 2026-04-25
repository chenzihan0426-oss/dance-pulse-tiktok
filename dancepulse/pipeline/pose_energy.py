"""
MediaPipe Pose 抽帧 + 动能曲线计算。

对外函数:
- compute_pose_energy(video_path) -> (timestamps_sec, energies)
- compute_pose_full(video_path) -> (timestamps_sec, energies, landmarks)
     landmarks[i] 为 (33, 3) ndarray: [x_norm, y_norm, visibility]; 未检出则为 None
- aggregate_segment_energy(timestamps, energies, start, end)
     -> (avg_energy, variance, n_samples)

兼容两套 MediaPipe API:
- 旧: mp.solutions.pose.Pose      (Python 3.11 + mediapipe < 0.11)
- 新: mp.tasks.vision.PoseLandmarker (Python 3.12 / 较新发行版)

检测失败的帧:沿用上一帧 landmarks,本帧能量记 0,landmarks 记 None。
"""

from __future__ import annotations

import os
import urllib.request
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np

from . import config


# ---------------------------------------------------------------------------
# API 探测
# ---------------------------------------------------------------------------

def _has_legacy_api() -> bool:
    try:
        import mediapipe as mp
        return hasattr(mp, "solutions") and hasattr(mp.solutions, "pose")
    except Exception:
        return False


def _has_tasks_api() -> bool:
    try:
        from mediapipe.tasks.python import vision  # noqa: F401
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Tasks API 需要本地模型文件。首次运行自动下载 Pose Landmarker Lite。
# ---------------------------------------------------------------------------

_POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
)

_MODEL_DIR_ENV = "DP_MEDIAPIPE_MODELS"
_DEFAULT_MODEL_DIR = Path.home() / ".cache" / "dancepulse" / "mediapipe"


def _ensure_pose_model() -> Path:
    model_dir = Path(os.environ.get(_MODEL_DIR_ENV, str(_DEFAULT_MODEL_DIR)))
    model_dir.mkdir(parents=True, exist_ok=True)
    path = model_dir / "pose_landmarker_lite.task"
    if not path.exists():
        print(f"[M1] 下载 Pose Landmarker 模型到 {path} ...")
        urllib.request.urlretrieve(_POSE_MODEL_URL, str(path))
    return path


# ---------------------------------------------------------------------------
# 对外主函数
# ---------------------------------------------------------------------------

def compute_pose_energy(video_path: str | Path) -> Tuple[List[float], List[float]]:
    """向后兼容入口:只返回 (timestamps, energies)。"""
    ts, energies, _ = compute_pose_full(video_path)
    return ts, energies


def compute_pose_full(
    video_path: str | Path,
) -> Tuple[List[float], List[float], List[np.ndarray | None]]:
    """
    一次性跑完 Pose,同时返回能量曲线和 33 关键点时序。

    返回:
        timestamps: List[float]           长度 N
        energies:   List[float]           长度 N,第一帧为 0
        landmarks:  List[ndarray | None]  长度 N,每项要么是 shape (33, 3)
                                          的 ndarray [x, y, visibility] (都归一化到 0-1),
                                          要么为 None 表示该帧未检出。

    优先使用 MediaPipe Pose。失败时降级到帧差法 —— landmarks 全部为 None,
    但能量曲线仍然有效,保证 pipeline 在任何环境下都能跑。
    """
    # DP_FORCE_FRAMEDIFF=1 强制走帧差(测试 / 无 GPU / Pose 模型不可得时)
    if os.environ.get("DP_FORCE_FRAMEDIFF") == "1":
        print("[M1] 使用帧差动能(DP_FORCE_FRAMEDIFF=1)")
        ts, energies = _compute_framediff(str(video_path))
        return ts, energies, [None] * len(ts)

    if _has_legacy_api():
        try:
            return _compute_legacy(str(video_path))
        except Exception as e:
            print(f"[M1][warn] legacy Pose 失败,降级帧差: {e}")

    if _has_tasks_api():
        try:
            return _compute_tasks(str(video_path))
        except Exception as e:
            print(f"[M1][warn] tasks Pose 失败,降级帧差: {e}")

    print("[M1][warn] 未检测到可用的 MediaPipe Pose,降级帧差动能")
    ts, energies = _compute_framediff(str(video_path))
    return ts, energies, [None] * len(ts)


def aggregate_segment_energy(
    timestamps: List[float],
    energies: List[float],
    start: float,
    end: float,
) -> Tuple[float, float, int]:
    """在 [start, end) 区间聚合能量,返回 (avg, variance, n_samples)。"""
    if not timestamps:
        return 0.0, 0.0, 0

    selected: List[float] = []
    for t, e in zip(timestamps, energies):
        if start <= t < end:
            selected.append(e)

    if not selected:
        return 0.0, 0.0, 0

    arr = np.asarray(selected, dtype=np.float64)
    return float(arr.mean()), float(arr.var()), len(arr)


# ---------------------------------------------------------------------------
# 旧 API 实现
# ---------------------------------------------------------------------------

def _compute_legacy(video_path: str) -> Tuple[List[float], List[float], List[np.ndarray | None]]:
    import mediapipe as mp

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"cv2 无法打开视频: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(fps / config.POSE_SAMPLE_FPS)))

    timestamps: List[float] = []
    energies: List[float] = []
    landmarks: List[np.ndarray | None] = []
    prev_points: np.ndarray | None = None

    pose = mp.solutions.pose.Pose(
        static_image_mode=False,
        model_complexity=config.POSE_MODEL_COMPLEXITY,
        enable_segmentation=False,
        min_detection_confidence=config.POSE_MIN_DETECTION_CONF,
        min_tracking_confidence=config.POSE_MIN_TRACKING_CONF,
    )
    try:
        frame_idx = 0
        while True:
            ret = cap.grab()
            if not ret:
                break
            if frame_idx % step != 0:
                frame_idx += 1
                continue
            ret, frame = cap.retrieve()
            if not ret or frame is None:
                frame_idx += 1
                continue

            t = frame_idx / fps
            timestamps.append(float(t))

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = pose.process(rgb)

            if result.pose_landmarks is None:
                energies.append(0.0)
                landmarks.append(None)
                frame_idx += 1
                continue

            points = np.array(
                [[lm.x, lm.y, lm.z] for lm in result.pose_landmarks.landmark],
                dtype=np.float32,
            )
            energies.append(_frame_energy(prev_points, points))
            # 存 (x, y, visibility) — z 对 2D 叠加无用,省 33% 带宽
            vis = np.array(
                [getattr(lm, "visibility", 1.0) for lm in result.pose_landmarks.landmark],
                dtype=np.float32,
            )
            frame_landmarks = np.stack([points[:, 0], points[:, 1], vis], axis=1)
            landmarks.append(frame_landmarks)
            prev_points = points
            frame_idx += 1
    finally:
        pose.close()
        cap.release()

    n = min(len(timestamps), len(energies), len(landmarks))
    return timestamps[:n], energies[:n], landmarks[:n]


# ---------------------------------------------------------------------------
# Tasks API 实现
# ---------------------------------------------------------------------------

def _compute_tasks(video_path: str) -> Tuple[List[float], List[float], List[np.ndarray | None]]:
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import (
        PoseLandmarker,
        PoseLandmarkerOptions,
        RunningMode,
    )

    model_path = _ensure_pose_model()

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"cv2 无法打开视频: {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(fps / config.POSE_SAMPLE_FPS)))

    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model_path)),
        running_mode=RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=config.POSE_MIN_DETECTION_CONF,
        min_pose_presence_confidence=config.POSE_MIN_DETECTION_CONF,
        min_tracking_confidence=config.POSE_MIN_TRACKING_CONF,
    )

    timestamps: List[float] = []
    energies: List[float] = []
    landmarks: List[np.ndarray | None] = []
    prev_points: np.ndarray | None = None
    last_ts_ms = -1  # VIDEO 模式要求时间戳严格递增

    landmarker = PoseLandmarker.create_from_options(options)
    try:
        frame_idx = 0
        while True:
            ret = cap.grab()
            if not ret:
                break
            if frame_idx % step != 0:
                frame_idx += 1
                continue
            ret, frame = cap.retrieve()
            if not ret or frame is None:
                frame_idx += 1
                continue

            t_sec = frame_idx / fps
            ts_ms = max(last_ts_ms + 1, int(t_sec * 1000))
            last_ts_ms = ts_ms

            timestamps.append(float(t_sec))

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect_for_video(mp_image, ts_ms)

            if not result.pose_landmarks:
                energies.append(0.0)
                landmarks.append(None)
                frame_idx += 1
                continue

            lms = result.pose_landmarks[0]
            points = np.array(
                [[lm.x, lm.y, getattr(lm, "z", 0.0)] for lm in lms],
                dtype=np.float32,
            )
            energies.append(_frame_energy(prev_points, points))
            vis = np.array(
                [getattr(lm, "visibility", 1.0) for lm in lms],
                dtype=np.float32,
            )
            frame_landmarks = np.stack([points[:, 0], points[:, 1], vis], axis=1)
            landmarks.append(frame_landmarks)
            prev_points = points
            frame_idx += 1
    finally:
        landmarker.close()
        cap.release()

    n = min(len(timestamps), len(energies), len(landmarks))
    return timestamps[:n], energies[:n], landmarks[:n]


# ---------------------------------------------------------------------------
# 共享:从 landmarks 位移计算瞬时能量
# ---------------------------------------------------------------------------

def _frame_energy(prev: np.ndarray | None, curr: np.ndarray) -> float:
    if prev is None:
        return 0.0
    delta = curr[:, :2] - prev[:, :2]
    return float(np.sqrt((delta ** 2).sum(axis=1)).sum())


# ---------------------------------------------------------------------------
# 帧差降级:不依赖 MediaPipe,保证 pipeline 鲁棒
# ---------------------------------------------------------------------------

def _compute_framediff(video_path: str) -> Tuple[List[float], List[float]]:
    """
    基于灰度帧差的运动能量。不如 Pose 精确,但足以支撑 is_still 与 difficulty 分桶。
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"cv2 无法打开视频: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(fps / config.POSE_SAMPLE_FPS)))

    timestamps: List[float] = []
    energies: List[float] = []
    prev_gray: np.ndarray | None = None

    try:
        frame_idx = 0
        while True:
            ret = cap.grab()
            if not ret:
                break
            if frame_idx % step != 0:
                frame_idx += 1
                continue
            ret, frame = cap.retrieve()
            if not ret or frame is None:
                frame_idx += 1
                continue

            t = frame_idx / fps
            timestamps.append(float(t))

            # 缩小提速 + 灰度
            small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0

            if prev_gray is None:
                energies.append(0.0)
            else:
                diff = np.abs(gray - prev_gray)
                energies.append(float(diff.mean()))
            prev_gray = gray
            frame_idx += 1
    finally:
        cap.release()

    n = min(len(timestamps), len(energies))
    return timestamps[:n], energies[:n]
