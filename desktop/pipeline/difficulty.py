"""
难度评分、静止判定、AI 描述兜底文案。

核心做法:百分位排名 → 1-5 星,保证分布不全是 3 星。
静止片段固定 1 星。
"""

from __future__ import annotations

from typing import List, Tuple

import numpy as np

from . import config


def compute_still_flags(
    avg_energies: List[float],
    variances: List[float],
) -> List[bool]:
    """
    为每个 segment 判定是否静止。

    - 优先百分位法:avg_energy 落在全 lesson 的 IS_STILL_ENERGY_QUANTILE 分位数
      以下,且 variance 也在 IS_STILL_VARIANCE_QUANTILE 分位数以下。
    - segment 数不足或退化时降级到硬阈值。
    """
    n = len(avg_energies)
    if n == 0:
        return []

    arr_e = np.asarray(avg_energies, dtype=np.float64)
    arr_v = np.asarray(variances, dtype=np.float64)

    use_quantile = n >= 8 and (arr_e.max() - arr_e.min()) > 1e-9

    if use_quantile:
        e_thresh = float(np.quantile(arr_e, config.IS_STILL_ENERGY_QUANTILE))
        v_thresh = float(np.quantile(arr_v, config.IS_STILL_VARIANCE_QUANTILE))
        return [
            bool(arr_e[i] <= e_thresh and arr_v[i] <= v_thresh)
            for i in range(n)
        ]

    # 降级硬阈值
    return [
        bool(arr_e[i] <= config.IS_STILL_HARD_ENERGY
             and arr_v[i] <= config.IS_STILL_HARD_VARIANCE)
        for i in range(n)
    ]


def compute_difficulties(
    avg_energies: List[float],
    variances: List[float],
    is_still: List[bool],
) -> List[int]:
    """
    给每个 segment 打 1-5 星。

    策略:
    - 静止片段固定 STILL_DIFFICULTY(=1)
    - 非静止片段:综合得分 = energy_norm * w_e + variance_norm * w_v
                 按得分排名 → 均匀分 5 等份(quintile) → 1-5
    - 若非静止片段少于 5 个,用硬映射避免全 3 星:
        1 个 → 3
        2 个 → [2,4]
        3 个 → [2,3,4]
        4 个 → [1,2,4,5]
    """
    n = len(avg_energies)
    if n == 0:
        return []

    diffs = [config.STILL_DIFFICULTY] * n
    active_idx = [i for i in range(n) if not is_still[i]]
    m = len(active_idx)

    if m == 0:
        return diffs

    e_vals = np.array([avg_energies[i] for i in active_idx], dtype=np.float64)
    v_vals = np.array([variances[i] for i in active_idx], dtype=np.float64)

    e_norm = _min_max(e_vals)
    v_norm = _min_max(v_vals)

    scores = (
        config.DIFFICULTY_ENERGY_WEIGHT * e_norm
        + config.DIFFICULTY_VARIANCE_WEIGHT * v_norm
    )

    if m >= 5:
        # 按分位分 5 桶
        order = np.argsort(scores)
        ranks = np.empty_like(order)
        ranks[order] = np.arange(m)
        # rank 0..m-1 → 1..5,分 5 等份,clamp 1-5
        buckets = np.clip(1 + (ranks * 5 // m), 1, 5)
        for local_i, global_i in enumerate(active_idx):
            diffs[global_i] = int(buckets[local_i])
    else:
        # 小样本硬映射
        fallback_map = {
            1: [3],
            2: [2, 4],
            3: [2, 3, 4],
            4: [1, 2, 4, 5],
        }
        pattern = fallback_map[m]
        # 按 scores 升序分配 pattern
        order = np.argsort(scores)
        for sorted_rank, local_i in enumerate(order):
            global_i = active_idx[local_i]
            diffs[global_i] = pattern[sorted_rank]

    return diffs


def _min_max(arr: np.ndarray) -> np.ndarray:
    """
    min-max 归一化到 [0,1]。全相等时返回全 0.5。
    """
    if arr.size == 0:
        return arr
    lo = arr.min()
    hi = arr.max()
    if hi - lo < 1e-12:
        return np.full_like(arr, 0.5, dtype=np.float64)
    return (arr - lo) / (hi - lo)


# ---------------------------------------------------------------------------
# ai_description 占位文案(teaching 未生成时的 fallback)
# ---------------------------------------------------------------------------

_DESCRIPTION_TEMPLATES = {
    "still": "{section}·静止定格,保持姿态",
    "low": "{section}·动作平缓,幅度较小",
    "mid": "{section}·常规节奏,动作清晰",
    "high": "{section}·节奏紧凑,动作幅度大",
    "extreme": "{section}·爆发段落,快速连续移动",
}


def make_ai_description(
    section_label: str,
    difficulty: int,
    is_still: bool,
) -> str:
    """
    生成简单的动作描述占位,M6 覆盖之前作为前端 fallback 文案。
    """
    if is_still:
        tpl = _DESCRIPTION_TEMPLATES["still"]
    elif difficulty <= 1:
        tpl = _DESCRIPTION_TEMPLATES["low"]
    elif difficulty == 2:
        tpl = _DESCRIPTION_TEMPLATES["low"]
    elif difficulty == 3:
        tpl = _DESCRIPTION_TEMPLATES["mid"]
    elif difficulty == 4:
        tpl = _DESCRIPTION_TEMPLATES["high"]
    else:
        tpl = _DESCRIPTION_TEMPLATES["extreme"]
    return tpl.format(section=section_label)
