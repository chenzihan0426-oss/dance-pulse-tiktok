"""
把 beat 数组、section 列表、pose 能量曲线融合成最终 Segment 列表。

主入口:
    build_segments(lesson_id, beats, sections, pose_timestamps, pose_energies,
                   beat_unit=8) -> List[dict]

返回的 segment dict 包含所有符合共享契约的字段,但:
- clip_url / thumbnail 此时为占位空字符串,在 pipeline 层调用 export 后回填
- teaching 仅填 {"status": "pending"}
"""

from __future__ import annotations

from typing import List, Tuple

from . import config
from .beat_detection import map_time_to_section
from .difficulty import (
    compute_difficulties,
    compute_still_flags,
    make_ai_description,
)
from .utils import make_segment_id, round2


def build_segments(
    lesson_id: str,
    beats: List[float],
    sections: List[dict],
    pose_timestamps: List[float],
    pose_energies: List[float],
    beat_unit: int = config.BEAT_UNITS_PER_SEGMENT,
) -> List[dict]:
    """
    按 beat_unit(默认 8)组装 segment,同时计算 is_still / difficulty / ai_description。

    返回的 segment 尚未写入 clip_url / thumbnail,调用方(run.py)要在导出 MP4 后回填。
    """
    if len(beats) < beat_unit + 1:
        # beat 太少,无法切出至少一个 segment
        return []

    # 先生成候选区间 [beats[i*bu], beats[(i+1)*bu]]
    raw_segments: List[Tuple[float, float]] = []
    i = 0
    while (i + 1) * beat_unit < len(beats):
        start = beats[i * beat_unit]
        end = beats[(i + 1) * beat_unit]
        raw_segments.append((start, end))
        i += 1

    if not raw_segments:
        return []

    # 逐段算能量
    from .pose_energy import aggregate_segment_energy  # 延迟 import

    avg_energies: List[float] = []
    variances: List[float] = []
    for start, end in raw_segments:
        avg_e, var_e, _ = aggregate_segment_energy(
            pose_timestamps, pose_energies, start, end
        )
        avg_energies.append(avg_e)
        variances.append(var_e)

    # 静止 & 难度
    still_flags = compute_still_flags(avg_energies, variances)
    difficulties = compute_difficulties(avg_energies, variances, still_flags)

    # 组装 segment dict
    segments: List[dict] = []
    for idx, (start, end) in enumerate(raw_segments):
        section = map_time_to_section((start + end) / 2.0, sections)
        is_still = still_flags[idx]
        difficulty = difficulties[idx]

        seg_id = make_segment_id(idx)
        segments.append({
            "id": seg_id,
            "lesson_id": lesson_id,
            "index": idx,
            "section": section["id"],
            "section_label": section["label"],
            "start": round2(start),
            "end": round2(end),
            "duration": round2(end - start),
            "beat_count": beat_unit,
            "thumbnail": "",   # run.py 回填
            "clip_url": "",    # run.py 回填
            "difficulty": int(difficulty),
            "is_still": bool(is_still),
            "ai_description": make_ai_description(
                section_label=section["label"],
                difficulty=difficulty,
                is_still=is_still,
            ),
            "user_edited": False,
            "teaching": {"status": "pending"},
        })

    return segments


def compute_section_energies(
    sections: List[dict],
    pose_timestamps: List[float],
    pose_energies: List[float],
) -> List[float]:
    """
    供 run.py 在段落重命名时用:每个 section 的平均能量。
    用于把能量最高的中间段落标为 chorus_N。
    """
    from .pose_energy import aggregate_segment_energy  # 延迟 import

    energies: List[float] = []
    for sec in sections:
        avg, _, _ = aggregate_segment_energy(
            pose_timestamps, pose_energies, sec["start"], sec["end"]
        )
        energies.append(avg)
    return energies
