"""
M1 Pipeline 全局配置。

所有可调参数集中在这里,方便外部视频预处理时微调。
所有路径使用 POSIX 分隔符 `/`。
"""

from __future__ import annotations

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# 路径
# ---------------------------------------------------------------------------

# pipeline/ 所在目录
PIPELINE_DIR = Path(__file__).resolve().parent

# 默认把 clips / thumbs 输出到 ../backend/data/,与文档约定一致
# 允许通过环境变量覆盖(方便 M2 在自己目录下调用 re_export_clip)
DEFAULT_BACKEND_DATA_DIR = PIPELINE_DIR.parent / "backend" / "data"
BACKEND_DATA_DIR = Path(os.environ.get("DP_BACKEND_DATA_DIR", DEFAULT_BACKEND_DATA_DIR))

CLIPS_DIR = BACKEND_DATA_DIR / "clips"
THUMBS_DIR = BACKEND_DATA_DIR / "thumbs"
LESSONS_DIR = BACKEND_DATA_DIR / "lessons"
VIDEOS_DIR = BACKEND_DATA_DIR / "videos"

# 前端引用静态资源使用的相对 URL 前缀(后端会挂到同名 mount)
URL_CLIPS_PREFIX = "/clips"
URL_THUMBS_PREFIX = "/thumbs"
URL_VIDEOS_PREFIX = "/videos"

# ---------------------------------------------------------------------------
# 音频 / 节拍
# ---------------------------------------------------------------------------

AUDIO_SR = 22050          # librosa 加载采样率;22050 对 beat track 足够
BEAT_UNITS_PER_SEGMENT = 8  # 默认按 8 拍切一个 segment
BEAT_SNAP_TOLERANCE = 0.01  # beat 对齐容差(秒),严于文档默认 0.1 但仅用于校验

# 段落检测
SECTION_K_DEFAULT = 6      # agglomerative 段落数,落在文档建议 5-7
SECTION_K_MIN = 4
SECTION_K_MAX = 7

# ---------------------------------------------------------------------------
# Pose / 动能
# ---------------------------------------------------------------------------

POSE_SAMPLE_FPS = 10       # 抽帧频率(fps),降采样以控制耗时
POSE_MODEL_COMPLEXITY = 0  # MediaPipe Pose Lite,速度优先
POSE_MIN_DETECTION_CONF = 0.5
POSE_MIN_TRACKING_CONF = 0.5

# ---------------------------------------------------------------------------
# 静止判定
# ---------------------------------------------------------------------------

# is_still: segment 的 avg_energy 低于整段 lesson 的 IS_STILL_ENERGY_QUANTILE 分位数
# 且 variance 也低于同分位数 → 判为静止
IS_STILL_ENERGY_QUANTILE = 0.20
IS_STILL_VARIANCE_QUANTILE = 0.25

# 若 lesson 总 segments < 8,上面分位法不稳定,降级用硬阈值
IS_STILL_HARD_ENERGY = 0.005
IS_STILL_HARD_VARIANCE = 0.001

# ---------------------------------------------------------------------------
# 难度
# ---------------------------------------------------------------------------

# 难度以百分位排名 → 1-5 星(保证分布不全是 3 星)
# 非静止 segment 的评分 = energy_weight * energy_norm + variance_weight * variance_norm
DIFFICULTY_ENERGY_WEIGHT = 0.65
DIFFICULTY_VARIANCE_WEIGHT = 0.35
# 静止片段固定 1 星
STILL_DIFFICULTY = 1

# ---------------------------------------------------------------------------
# 导出 clip
# ---------------------------------------------------------------------------

CLIP_VCODEC = "libx264"
CLIP_ACODEC = "aac"
CLIP_CRF = "23"
CLIP_PRESET = "veryfast"
THUMB_QUALITY = "3"        # ffmpeg -q:v 2-5 推荐范围
