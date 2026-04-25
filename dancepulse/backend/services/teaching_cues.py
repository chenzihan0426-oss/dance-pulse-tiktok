from __future__ import annotations

import logging
import re


_ALLOWED_CUE_RE = re.compile(r"^[\u3400-\u4DBF\u4E00-\u9FFF]+$")
_FORBIDDEN_FILLER_CUES = {
    "保持",
    "继续",
    "稳住",
    "停住",
    "过渡",
    "衔接",
    "准备",
    "等待",
}
_MAX_CUE_LENGTH = 8


def build_null_beat_cues(beat_count: int) -> list[str | None]:
    count = max(int(beat_count or 0), 0)
    return [None] * count


def normalize_beat_cues(
    cues: object,
    beat_count: int,
    *,
    logger: logging.Logger | None = None,
    context: str = "beat_cues",
) -> list[str | None]:
    normalized = build_null_beat_cues(beat_count)
    count = len(normalized)

    if not isinstance(cues, list):
        if cues is not None and logger is not None:
            logger.warning("%s is not a list, falling back to null cues", context)
        return normalized

    if len(cues) != count and logger is not None:
        logger.warning(
            "%s length mismatch: expected=%d actual=%d; coercing",
            context,
            count,
            len(cues),
        )

    for index, raw_value in enumerate(cues[:count]):
        cue = _normalize_single_cue(raw_value)
        normalized[index] = cue

    return normalized


def _normalize_single_cue(value: object) -> str | None:
    if value is None or not isinstance(value, str):
        return None

    cue = value.strip()
    if not cue:
        return None

    if cue in _FORBIDDEN_FILLER_CUES:
        return None

    if len(cue) > _MAX_CUE_LENGTH:
        return None

    if not _ALLOWED_CUE_RE.fullmatch(cue):
        return None

    return cue
