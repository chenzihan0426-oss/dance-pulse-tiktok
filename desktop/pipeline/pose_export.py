"""
老师骨架时序导出:把 compute_pose_full 出的 landmarks 按 segment 切片,
写到 backend/data/pose/{lesson_id}/{seg_id}.json。

格式(保持最小字节数,前端用 JSON.parse 直接用):
{
  "seg_id": "seg_000",
  "lesson_id": "les_abc123",
  "fps": 10,
  "start": 0.26,
  "end": 5.32,
  "frames": [
    {"t": 0.1, "kp": [[x,y,v], [x,y,v], ...(33个)...] },
    {"t": 0.2, "kp": null},
    ...
  ]
}

x, y 已归一化到 [0,1](相对 clip 画面),前端按自己的 canvas 尺寸做乘法即可。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional

import numpy as np


# 坐标精度:3 位小数对 1080p 有效精度是 ±1px,够用
_COORD_PRECISION = 3


def export_segment_pose(
    *,
    lesson_id: str,
    segment_id: str,
    start: float,
    end: float,
    timestamps: List[float],
    landmarks: List[Optional[np.ndarray]],
    fps: int,
    output_dir: Path,
) -> Path:
    """
    把一个 segment 区间内的 landmarks 切出来写盘。返回写入的文件路径。

    timestamps / landmarks 是 lesson 级全量,长度相等。
    输出路径: output_dir / {lesson_id} / {segment_id}.json
    """
    out_root = Path(output_dir) / lesson_id
    out_root.mkdir(parents=True, exist_ok=True)
    out_path = out_root / f"{segment_id}.json"

    frames = []
    for t, lm in zip(timestamps, landmarks):
        if not (start <= t < end):
            continue
        # clip 内相对时间(0 起步),给前端按 video.currentTime 对齐用
        t_rel = round(t - start, 3)
        if lm is None:
            frames.append({"t": t_rel, "kp": None})
        else:
            kp = [
                [
                    round(float(row[0]), _COORD_PRECISION),
                    round(float(row[1]), _COORD_PRECISION),
                    round(float(row[2]), 2),
                ]
                for row in lm
            ]
            frames.append({"t": t_rel, "kp": kp})

    doc = {
        "seg_id": segment_id,
        "lesson_id": lesson_id,
        "fps": fps,
        "start": round(float(start), 2),
        "end": round(float(end), 2),
        "frames": frames,
    }

    out_path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return out_path
