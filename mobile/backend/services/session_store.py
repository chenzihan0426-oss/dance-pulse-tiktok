"""姿态比对会话存储（手机端轻量版：JSON 落盘，接口对齐 desktop session_store）。

不做 SQLAlchemy / 滚动聚合库；难度聚合用内存重算近似值，足够 Feedback 历史回看。
"""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

SESSIONS_DIR = DATA_DIR / "tracking_sessions"
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_session_id() -> str:
    return f"sess_{secrets.token_hex(6)}"


def _session_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.json"


def save_session_result(*, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    lesson_id = str(payload.get("lessonId", ""))
    overall = int(round(float(payload.get("overallScore", 0))))
    pose_source = str(payload.get("poseSource", ""))
    frame_count = int(payload.get("frameCount", 0))
    segments = payload.get("segments", []) or []

    session_id = _new_session_id()
    created = _now_iso()
    record = {
        "sessionId": session_id,
        "userId": user_id,
        "lessonId": lesson_id,
        "createdAt": created,
        "overallScore": max(0, min(100, overall)),
        "poseSource": pose_source,
        "frameCount": frame_count,
        "segments": segments,
    }
    _session_path(session_id).write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
    return {"sessionId": session_id, "overallScore": record["overallScore"], "segments": len(segments)}


def list_sessions(*, lesson_id: str, user_id: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in SESSIONS_DIR.glob("sess_*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if data.get("lessonId") != lesson_id:
            continue
        if user_id and data.get("userId") not in (user_id, "guest_local") and user_id != "guest_local":
            # guest 可见自己；登录用户看自己的
            if data.get("userId") != user_id:
                continue
        items.append(
            {
                "sessionId": data.get("sessionId"),
                "overallScore": int(data.get("overallScore", 0)),
                "frameCount": int(data.get("frameCount", 0)),
                "poseSource": str(data.get("poseSource", "")),
                "createdAt": str(data.get("createdAt", "")),
            }
        )
    items.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return items


def get_difficulty_aggregates(*, lesson_id: str, scope: str) -> list[dict[str, Any]]:
    """按 segment 粗聚合；scope 形如 global 或 user:<id>。"""
    user_filter: str | None = None
    if scope.startswith("user:"):
        user_filter = scope.split(":", 1)[1]

    by_seg: dict[str, list[float]] = {}
    worst_joint: dict[str, str | None] = {}

    for path in SESSIONS_DIR.glob("sess_*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if data.get("lessonId") != lesson_id:
            continue
        if user_filter and data.get("userId") != user_filter:
            continue
        for seg in data.get("segments") or []:
            sid = str(seg.get("segmentId") or seg.get("id") or "")
            if not sid:
                continue
            score = float(seg.get("score") or seg.get("boneScore") or seg.get("fusedScore") or 0)
            by_seg.setdefault(sid, []).append(score)
            if sid not in worst_joint:
                wj = seg.get("topWorstJoint") or seg.get("worstJoint")
                worst_joint[sid] = str(wj) if wj else None

    out: list[dict[str, Any]] = []
    for sid, scores in by_seg.items():
        n = len(scores)
        avg = sum(scores) / n if n else 0.0
        var = sum((x - avg) ** 2 for x in scores) / n if n else 0.0
        # 与 desktop 近似的 1–5 难度
        if avg >= 90:
            diff = 1
        elif avg >= 80:
            diff = 2
        elif avg >= 68:
            diff = 3
        elif avg >= 55:
            diff = 4
        else:
            diff = 5
        if var > 400 and diff < 5:
            diff += 1
        out.append(
            {
                "segmentId": sid,
                "attempts": n,
                "avgScore": round(avg, 2),
                "scoreVariance": round(var, 2),
                "measuredDifficulty": diff,
                "topWorstJoint": worst_joint.get(sid),
                "updatedAt": _now_iso(),
            }
        )
    return out
