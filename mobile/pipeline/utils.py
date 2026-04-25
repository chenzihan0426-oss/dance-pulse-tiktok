"""
通用工具:时间精度、beat 对齐、路径处理。

所有 JSON 写入前都要经过 round2();beat 对齐在 segment 组装时做一次性处理。
"""

from __future__ import annotations

from pathlib import Path
from typing import Sequence


def round2(x: float) -> float:
    """
    统一 2 位小数。所有写入 Lesson JSON 的时间值都必须经过这个函数。
    """
    return round(float(x), 2)


def posix(path: str | Path) -> str:
    """把任意路径统一为 POSIX 风格(`/`)字符串。"""
    return Path(path).as_posix()


def find_nearest_beat_index(t: float, beats: Sequence[float]) -> int:
    """
    在 beats 数组中找到距离 t 最近的 beat 索引。O(log n) 二分。
    """
    if not beats:
        raise ValueError("beats 数组为空")
    lo, hi = 0, len(beats) - 1
    if t <= beats[0]:
        return 0
    if t >= beats[-1]:
        return hi
    while lo <= hi:
        mid = (lo + hi) // 2
        if beats[mid] < t:
            lo = mid + 1
        else:
            hi = mid - 1
    # lo 是第一个 >= t 的位置;比较 lo 和 lo-1 哪个更近
    if lo >= len(beats):
        return len(beats) - 1
    left = lo - 1 if lo > 0 else 0
    return left if abs(beats[left] - t) <= abs(beats[lo] - t) else lo


def snap_to_beat(t: float, beats: Sequence[float]) -> float:
    """
    把任意时间吸附到最近的 beat。总是返回 beats 里真实存在的值。
    """
    idx = find_nearest_beat_index(t, beats)
    return float(beats[idx])


def is_on_beat(t: float, beats: Sequence[float], tolerance: float = 0.01) -> bool:
    """判断 t 是否落在 beats 数组上(容差内)。"""
    idx = find_nearest_beat_index(t, beats)
    return abs(beats[idx] - t) <= tolerance


def make_segment_id(index: int) -> str:
    """
    Segment ID 格式 seg_XXX,3 位补零。index 上限 999(对 K-pop 单曲足够)。
    """
    if index < 0 or index > 999:
        raise ValueError(f"segment index 越界: {index}")
    return f"seg_{index:03d}"


def safe_slug(text: str) -> str:
    """
    简单 slug:保留 [a-z0-9_-],其他转 `_`。用于 lesson id fallback。
    """
    import re
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9_-]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "lesson"
