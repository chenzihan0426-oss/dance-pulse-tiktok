from __future__ import annotations

import base64
import json
import os
import re
import time
from pathlib import Path

import requests

from models import Lesson, Segment, Teaching, TeachingStatus, TeachingStep

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


def _clip_fs_path(segment: Segment) -> Path:
    rel = segment.clip_url.lstrip("/")
    return (DATA_DIR / rel).resolve()


def _extract_jpeg_frames(clip_path: Path, n: int = 4) -> list[bytes]:
    try:
        import cv2  # noqa: PLC0415
    except ImportError:
        return []

    cap = cv2.VideoCapture(str(clip_path))
    if not cap.isOpened():
        return []
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    frames: list[bytes] = []
    for i in range(1, n + 1):
        idx = min(max(int(total * i / (n + 1)), 0), total - 1)
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        _, buf = cv2.imencode(".jpg", frame)
        frames.append(buf.tobytes())
    cap.release()
    return frames


def _mock_teaching(segment: Segment) -> Teaching:
    return Teaching(
        status=TeachingStatus.READY,
        summary=f"{segment.section_label} 动作要点（占位）",
        steps=[
            TeachingStep(beats="1-2", content="听拍，稳定重心"),
            TeachingStep(beats="3-4", content="完成本段主动作"),
        ],
        tips=["注意身体线条", "不要抢拍"],
        generated_at="",
    )


def _parse_teaching_json(text: str) -> Teaching:
    text = text.strip()
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        text = m.group(0)
    data = json.loads(text)
    steps_raw = data.get("steps") or []
    steps = [TeachingStep(beats=s.get("beats", ""), content=s.get("content", "")) for s in steps_raw]
    return Teaching(
        status=TeachingStatus.READY,
        summary=str(data.get("summary", "")),
        steps=steps,
        tips=[str(t) for t in (data.get("tips") or [])],
        generated_at="",
    )


def _ark_chat(images_b64: list[str], prompt: str) -> str:
    api_key = (
        os.getenv("DASHSCOPE_API_KEY", "").strip()
        or os.getenv("QWEN_API_KEY", "").strip()
        or os.getenv("DOUBAO_API_KEY", "").strip()
    )
    url = os.getenv(
        "DASHSCOPE_API_URL",
        os.getenv(
            "QWEN_API_URL",
            os.getenv(
                "DOUBAO_API_URL",
                "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
            ),
        ),
    ).strip()
    model = (
        os.getenv("QWEN_MODEL", "").strip()
        or os.getenv("DASHSCOPE_MODEL", "").strip()
        or os.getenv("DOUBAO_MODEL", "").strip()
        or "qwen-vl-plus"
    )
    if not api_key or not model:
        raise RuntimeError("缺少 DASHSCOPE_API_KEY / QWEN_API_KEY 或 QWEN_MODEL")

    content: list[dict] = [{"type": "text", "text": prompt}]
    for b64 in images_b64:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
            }
        )

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.3,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    last_err: Exception | None = None
    for attempt in range(3):
        resp = requests.post(url, headers=headers, json=payload, timeout=120)
        if resp.status_code in (429, 500, 502, 503):
            time.sleep(2**attempt)
            last_err = RuntimeError(resp.text[:500])
            continue
        resp.raise_for_status()
        data = resp.json()
        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        out = msg.get("content")
        if isinstance(out, str):
            return out
        if isinstance(out, list):
            parts = []
            for block in out:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block.get("text", ""))
            return "".join(parts)
        raise RuntimeError("无法解析模型返回内容")
    raise last_err or RuntimeError("豆包请求失败")


def generate_teaching_for_segment(lesson: Lesson, segment: Segment) -> Teaching:
    if os.getenv("TEACHING_USE_MOCK", "").lower() in ("1", "true", "yes"):
        return _mock_teaching(segment)

    clip = _clip_fs_path(segment)
    if not clip.exists():
        raise FileNotFoundError(clip)

    frames = _extract_jpeg_frames(clip, 4)
    if not frames:
        if not (
            os.getenv("DASHSCOPE_API_KEY")
            or os.getenv("QWEN_API_KEY")
            or os.getenv("DOUBAO_API_KEY")
        ):
            return _mock_teaching(segment)
        raise RuntimeError("无法从切片抽取关键帧，请安装 opencv-python-headless")

    images_b64 = [base64.b64encode(f).decode("ascii") for f in frames]

    prompt = f"""你是一位 K-pop 舞蹈教学助手。以下是一个 {segment.beat_count} 拍左右的舞蹈切片关键帧（按时间顺序）。
- 段落：{segment.section_label}
- BPM：{lesson.bpm}
- 时长：{segment.duration}s

请只输出 JSON（不要其它文字）：
{{
  "summary": "一句话概括（不超过 20 字）",
  "steps": [
    {{"beats": "1-2", "content": "动作描述"}},
    {{"beats": "3-4", "content": "动作描述"}}
  ],
  "tips": ["易错点或发力提示"]
}}"""

    if not (
        os.getenv("DASHSCOPE_API_KEY")
        or os.getenv("QWEN_API_KEY")
        or os.getenv("DOUBAO_API_KEY")
    ):
        return _mock_teaching(segment)

    raw = _ark_chat(images_b64, prompt)
    teaching = _parse_teaching_json(raw)
    return teaching
