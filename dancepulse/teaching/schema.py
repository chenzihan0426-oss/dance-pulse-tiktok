from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, Field, field_validator

from backend.services.teaching_cues import build_null_beat_cues, normalize_beat_cues


class StepItem(BaseModel):
    beats: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)


class TeachingPayload(BaseModel):
    summary: str = Field(..., min_length=1)
    steps: list[StepItem] = Field(..., min_length=1)
    tips: list[str] = Field(default_factory=list)
    beat_cues: list[str | None] = Field(default_factory=list)

    @field_validator("summary")
    @classmethod
    def _clean_summary(cls, value: str) -> str:
        return value.strip()

    @field_validator("tips")
    @classmethod
    def _clean_tips(cls, value: list[str]) -> list[str]:
        return [item.strip() for item in value if isinstance(item, str) and item.strip()]


_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)


def clean_and_parse_json(raw: str) -> dict[str, Any]:
    if not isinstance(raw, str):
        raise ValueError(f"expected str, got {type(raw).__name__}")

    text = raw.strip()

    fenced_match = _CODE_FENCE_RE.search(text)
    if fenced_match:
        text = fenced_match.group(1).strip()

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        candidate = text[start : end + 1]
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError as exc:
            raise ValueError(f"cannot parse JSON from model output: {exc}") from exc

    raise ValueError("no JSON object found in model output")


def parse_and_validate_teaching(
    raw: str,
    beat_count: int,
    *,
    logger=None,
    context: str = "teaching payload",
) -> TeachingPayload:
    obj = clean_and_parse_json(raw)
    if "beat_cues" not in obj and logger is not None:
        logger.warning("%s missing beat_cues, falling back to null cues", context)

    obj["beat_cues"] = normalize_beat_cues(
        obj.get("beat_cues"),
        beat_count,
        logger=logger,
        context=f"{context}.beat_cues",
    )

    payload = TeachingPayload.model_validate(obj)
    if not payload.beat_cues:
        payload = payload.model_copy(update={"beat_cues": build_null_beat_cues(beat_count)})
    return payload
