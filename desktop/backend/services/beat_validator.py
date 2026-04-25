from __future__ import annotations


BEAT_TOLERANCE = 0.01


def round_time(value: float) -> float:
    return round(value, 2)


def is_on_beat(value: float, beats: list[float], tolerance: float = BEAT_TOLERANCE) -> bool:
    return any(abs(beat - value) <= tolerance for beat in beats)


def validate_on_beat(value: float, beats: list[float], field_name: str) -> None:
    if not is_on_beat(value, beats):
        raise ValueError(f"{field_name} must align with lesson beats")
