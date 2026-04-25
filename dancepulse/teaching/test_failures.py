from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.pop("DASHSCOPE_API_KEY", None)
os.environ.pop("QWEN_API_KEY", None)
os.environ["DP_VLM_MODE"] = "mock"

from teaching import generate_teaching as generate_module  # noqa: E402
from teaching.schema import clean_and_parse_json, parse_and_validate_teaching  # noqa: E402
from teaching.vlm_client import BaseVLMClient, VLMError  # noqa: E402


class FakeClient(BaseVLMClient):
    def __init__(self, response):
        self.response = response
        self.calls = 0

    def generate(self, prompt: str, images_b64: list[str]) -> str:
        self.calls += 1
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


@pytest.fixture
def segment() -> dict:
    return {
        "id": "seg_000",
        "beat_count": 8,
        "section_label": "副歌",
        "duration": 3.0,
        "difficulty": 3,
        "ai_description": "fallback text",
    }


def test_json_cleaning():
    obj = clean_and_parse_json('{"summary": "hi", "steps": [], "tips": []}')
    assert obj["summary"] == "hi"

    fenced = (
        '```json\n'
        '{"summary": "hi", "steps": [{"beats": "1-2", "content": "x"}], "tips": []}\n'
        '```'
    )
    obj = clean_and_parse_json(fenced)
    assert obj["summary"] == "hi"

    wrapped = (
        'Here is the result:\n'
        '{"summary": "hi", "steps": [], "tips": []}\n'
        "Hope this helps."
    )
    obj = clean_and_parse_json(wrapped)
    assert obj["summary"] == "hi"

    with pytest.raises(ValueError):
        clean_and_parse_json("I am not JSON at all")


def test_schema_validation_rejects_invalid_shapes():
    with pytest.raises(Exception):
        parse_and_validate_teaching('{"summary": "x", "tips": []}', 8)

    with pytest.raises(Exception):
        parse_and_validate_teaching(
            '{"summary": "x", "steps": [{"beats":"1-2","content":"a"}], "tips": "not array"}',
            8,
        )

    with pytest.raises(Exception):
        parse_and_validate_teaching('{"summary": "x", "steps": [], "tips": []}', 8)


def test_missing_beat_cues_falls_back_to_nulls():
    payload = parse_and_validate_teaching(
        '{"summary":"x","steps":[{"beats":"1-2","content":"a"}],"tips":["tip"]}',
        8,
    )
    assert payload.beat_cues == [None] * 8


def test_beat_cues_are_normalized():
    payload = parse_and_validate_teaching(
        (
            '{"summary":"x","steps":[{"beats":"1-2","content":"a"}],"tips":["tip"],'
            '"beat_cues":["起手","继续","右肩上","abc","超长超长超长超长超长",null,5,"定点"]}'
        ),
        8,
    )
    assert payload.beat_cues == ["起手", None, "右肩上", None, None, None, None, "定点"]


def test_missing_clip_file_returns_failed(segment: dict):
    result = generate_module.generate_teaching_for_segment(
        clip_path="/nonexistent/seg_missing.mp4",
        segment=segment,
        lesson_context={"bpm": 120, "title": "Test"},
    )
    assert result["status"] == "failed"
    assert result["steps"] == []
    assert result["tips"] == []
    assert result["beat_cues"] == [None] * 8
    assert result["summary"] == "fallback text"
    assert "generated_at" in result


def test_vlm_returns_garbage(monkeypatch: pytest.MonkeyPatch, segment: dict):
    monkeypatch.setattr(generate_module, "extract_keyframes_base64", lambda *_args, **_kwargs: ["frame"])
    client = FakeClient("this is not JSON at all")

    result = generate_module.generate_teaching_for_segment(
        clip_path="unused.mp4",
        segment=segment,
        lesson_context={"bpm": 120, "title": "Test"},
        client=client,
    )
    assert result["status"] == "failed"
    assert result["beat_cues"] == [None] * 8
    assert "schema error" in result.get("error", "")


def test_vlm_raises(monkeypatch: pytest.MonkeyPatch, segment: dict):
    monkeypatch.setattr(generate_module, "extract_keyframes_base64", lambda *_args, **_kwargs: ["frame"])
    client = FakeClient(VLMError("HTTP 500 after retries"))

    result = generate_module.generate_teaching_for_segment(
        clip_path="unused.mp4",
        segment=segment,
        lesson_context={"bpm": 120, "title": "Test"},
        client=client,
    )
    assert result["status"] == "failed"
    assert result["beat_cues"] == [None] * 8
