"""
音频抽取、节拍检测、段落检测。

对外函数:
- extract_audio(video_path) -> (sr, y)
- detect_beats(y, sr) -> (bpm, beats_sec[])
- detect_sections(y, sr, duration, k=None) -> List[Section]

Section dict 形状:
    {"id": "verse_1", "label": "Verse 1", "start": 12.34, "end": 56.78}
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import List, Tuple

import librosa
import numpy as np

from . import config
from .utils import round2


# ---------------------------------------------------------------------------
# 音频抽取
# ---------------------------------------------------------------------------

def extract_audio(video_path: str | Path) -> Tuple[int, np.ndarray]:
    """
    从视频中抽取单声道音频,返回 (sample_rate, waveform)。
    内部走 ffmpeg → 临时 WAV → librosa.load,兼容性最好。
    """
    video_path = str(video_path)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name
    try:
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", video_path,
            "-vn", "-ac", "1", "-ar", str(config.AUDIO_SR),
            "-f", "wav", wav_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        y, sr = librosa.load(wav_path, sr=config.AUDIO_SR, mono=True)
        return sr, y
    finally:
        Path(wav_path).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# 节拍检测
# ---------------------------------------------------------------------------

def detect_beats(y: np.ndarray, sr: int) -> Tuple[float, List[float]]:
    """
    返回 (bpm, beats_sec)。beats_sec 是完整 beat 时间点数组(秒)。
    """
    # librosa 0.10+ 推荐显式传 units='time'
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beats_sec = librosa.frames_to_time(beat_frames, sr=sr)

    # tempo 可能是 numpy scalar / array,统一成 float
    if hasattr(tempo, "item"):
        bpm = float(tempo.item() if tempo.size == 1 else tempo.mean())
    else:
        bpm = float(tempo)

    # 去重 + 排序保底
    beats_list = sorted(set(float(b) for b in beats_sec))
    return bpm, beats_list


# ---------------------------------------------------------------------------
# 段落检测
# ---------------------------------------------------------------------------

def detect_sections(
    y: np.ndarray,
    sr: int,
    duration: float,
    k: int | None = None,
    section_energies: List[float] | None = None,
) -> List[dict]:
    """
    用 agglomerative 聚类给歌曲分段。

    若 section_energies 传入(与返回 sections 数量一致),则依据能量分布给
    section 赋予更有语义的 label(intro/verse/chorus/outro)。

    参数:
        y: 音频波形
        sr: 采样率
        duration: 视频总时长(秒)
        k: 段落数,默认 config.SECTION_K_DEFAULT,取值在 [SECTION_K_MIN, SECTION_K_MAX]
        section_energies: 可选。每段对应的 pose-avg energy,用于 chorus/verse 区分。
                          若未知,先以时间顺序给默认 label,调用方后续再覆盖。

    返回:
        List[Section]:[{id, label, start, end}]
    """
    k = k or config.SECTION_K_DEFAULT
    k = max(config.SECTION_K_MIN, min(config.SECTION_K_MAX, k))

    # 先提特征:chroma + MFCC 组合
    hop_length = 512
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=hop_length, n_mfcc=13)

    # stack 做多模态
    feat = np.vstack([chroma, mfcc])

    # agglomerative 返回 frame 边界(含首尾)
    try:
        bounds_frames = librosa.segment.agglomerative(feat, k=k)
    except Exception:
        # 极短音频上可能失败,兜底为均匀分段
        return _uniform_sections(duration, k)

    bounds_sec = librosa.frames_to_time(bounds_frames, sr=sr, hop_length=hop_length)
    bounds_sec = sorted(set(float(b) for b in bounds_sec))

    # 保证首尾落在 [0, duration]
    if not bounds_sec or bounds_sec[0] > 0:
        bounds_sec = [0.0] + bounds_sec
    if bounds_sec[-1] < duration:
        bounds_sec.append(float(duration))

    # 构造 sections
    sections: List[dict] = []
    for i in range(len(bounds_sec) - 1):
        start = bounds_sec[i]
        end = bounds_sec[i + 1]
        if end - start < 0.5:
            # 太短的段落合并到前一段
            if sections:
                sections[-1]["end"] = round2(end)
            continue
        sections.append({
            "id": f"section_{i}",
            "label": f"Section {i + 1}",
            "start": round2(start),
            "end": round2(end),
        })

    if not sections:
        return _uniform_sections(duration, k)

    # 重新给 id / label 上语义
    _assign_semantic_labels(sections, section_energies)
    return sections


def _uniform_sections(duration: float, k: int) -> List[dict]:
    """降级方案:把时长均匀切成 k 段。"""
    sections = []
    step = duration / max(k, 1)
    for i in range(k):
        start = i * step
        end = (i + 1) * step if i < k - 1 else duration
        sections.append({
            "id": f"section_{i}",
            "label": f"Section {i + 1}",
            "start": round2(start),
            "end": round2(end),
        })
    _assign_semantic_labels(sections, None)
    return sections


def _assign_semantic_labels(
    sections: List[dict],
    energies: List[float] | None,
) -> None:
    """
    按启发式给 section 赋语义标签,就地修改 sections。

    规则:
    - 第一段 → intro / 前奏
    - 最后一段 → outro / 尾声
    - 中间段:若有 energies 数据,能量最高的两个标为 chorus_N,其余按顺序为 verse_N
             若无 energies,按时间顺序交替 verse / chorus
    """
    n = len(sections)
    if n == 0:
        return

    # 占位,先全部标为 middle
    labels = ["middle"] * n
    if n >= 1:
        labels[0] = "intro"
    if n >= 2:
        labels[-1] = "outro"

    middle_indices = [i for i in range(n) if labels[i] == "middle"]

    if energies and len(energies) == n:
        # 按能量排名:前 min(2, len(middle)) 个标为 chorus
        ranked = sorted(middle_indices, key=lambda i: energies[i], reverse=True)
        chorus_count = min(2, len(ranked))
        chorus_indices = set(ranked[:chorus_count])
        verse_no = 0
        chorus_no = 0
        for i in middle_indices:
            if i in chorus_indices:
                chorus_no += 1
                labels[i] = f"chorus_{chorus_no}"
            else:
                verse_no += 1
                labels[i] = f"verse_{verse_no}"
    else:
        # 按顺序交替:verse_1, chorus_1, verse_2, chorus_2 ...
        verse_no = 0
        chorus_no = 0
        for i in middle_indices:
            if (i % 2) == 1:
                chorus_no += 1
                labels[i] = f"chorus_{chorus_no}"
            else:
                verse_no += 1
                labels[i] = f"verse_{verse_no}"

    # 写回 sections
    label_map_cn = {
        "intro": "前奏",
        "outro": "尾声",
    }
    for i, sec in enumerate(sections):
        sid = labels[i]
        sec["id"] = sid
        if sid in label_map_cn:
            sec["label"] = label_map_cn[sid]
        elif sid.startswith("verse_"):
            n_ = sid.split("_")[1]
            sec["label"] = f"主歌 {n_}"
        elif sid.startswith("chorus_"):
            n_ = sid.split("_")[1]
            sec["label"] = f"副歌 {n_}"
        else:
            sec["label"] = sid


def map_time_to_section(t: float, sections: List[dict]) -> dict:
    """
    把一个时间点映射到对应的 section。
    若超出所有段落(理论不该发生),返回最近的一段。
    """
    if not sections:
        return {"id": "unknown", "label": "未知", "start": 0.0, "end": 0.0}
    for sec in sections:
        if sec["start"] <= t < sec["end"]:
            return sec
    # 边界处理:t 正好等于最后 end,归入最后一段
    return sections[-1]
