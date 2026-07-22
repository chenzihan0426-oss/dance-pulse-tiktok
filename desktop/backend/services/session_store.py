"""姿态比对会话存储 + 难点聚合（Phase 2/3/4）。

写入一次挑战的 SessionResult：
  1. 存 tracking_sessions（会话总览）
  2. 每个 segment 存一行 segment_attempts（可查询的逐动作粒度）
  3. 更新 segment_difficulty_agg 的 global 与 user 两个 scope 的滚动聚合
     —— 这就是"难点检测"，也是卡片回写的数据源。

聚合用 Welford 式滚动统计，无需回读全部历史行。
"""

from __future__ import annotations

import math
import secrets
from datetime import UTC, datetime
from typing import Any

from sqlmodel import select

from services.db import session_scope
from services.db_models import (
    SegmentAttemptRow,
    SegmentDifficultyAggRow,
    TrackingSessionRow,
)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_session_id() -> str:
    return f"sess_{secrets.token_hex(6)}"


def _new_attempt_id() -> str:
    return f"att_{secrets.token_hex(6)}"


def _difficulty_from(avg_score: float, variance: float) -> int:
    """把平均分(0-100)+方差映射到 1-5 难度。分越低越难；方差大略微加难。"""
    # 基础：分数越低越难
    if avg_score >= 90:
        base = 1
    elif avg_score >= 80:
        base = 2
    elif avg_score >= 68:
        base = 3
    elif avg_score >= 55:
        base = 4
    else:
        base = 5
    # 高波动（不稳定）再 +1，封顶 5
    if variance > 400 and base < 5:  # std > 20 分
        base += 1
    return max(1, min(5, base))


def save_session_result(*, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """payload 为前端 SessionResult（camelCase）。返回落库后的摘要。"""
    lesson_id = str(payload.get("lessonId", ""))
    overall = int(round(float(payload.get("overallScore", 0))))
    pose_source = str(payload.get("poseSource", ""))
    frame_count = int(payload.get("frameCount", 0))
    segments = payload.get("segments", []) or []

    session_id = _new_session_id()
    created = _now_iso()

    with session_scope() as s:
        s.add(
            TrackingSessionRow(
                id=session_id,
                user_id=user_id,
                lesson_id=lesson_id,
                created_at=created,
                overall_score=max(0, min(100, overall)),
                pose_source=pose_source,
                frame_count=frame_count,
                video_url=payload.get("videoUrl"),
            )
        )

        for seg in segments:
            segment_id = str(seg.get("segmentId", ""))
            if not segment_id:
                continue
            score = max(0, min(100, int(round(float(seg.get("score", 0))))))
            attempt = SegmentAttemptRow(
                id=_new_attempt_id(),
                session_id=session_id,
                user_id=user_id,
                lesson_id=lesson_id,
                segment_id=segment_id,
                score=score,
                joint_errors=seg.get("jointErrors", {}) or {},
                beat_scores=seg.get("beatScores", []) or [],
                worst_joint=seg.get("worstJoint"),
                worst_beat=seg.get("worstBeat"),
                frame_count=int(seg.get("frameCount", 0)),
                created_at=created,
            )
            s.add(attempt)

            # 更新两个 scope 的聚合
            for scope in ("global", f"user:{user_id}"):
                _update_agg(s, lesson_id, segment_id, scope, score, seg.get("worstJoint"), created)

    return {"sessionId": session_id, "overallScore": overall, "segments": len(segments)}


def _update_agg(
    s: Any,
    lesson_id: str,
    segment_id: str,
    scope: str,
    score: int,
    worst_joint: str | None,
    now: str,
) -> None:
    row = s.get(SegmentDifficultyAggRow, (lesson_id, segment_id, scope))
    if row is None:
        row = SegmentDifficultyAggRow(
            lesson_id=lesson_id,
            segment_id=segment_id,
            scope=scope,
            attempts=0,
            avg_score=0.0,
            score_variance=0.0,
            measured_difficulty=0,
            top_worst_joint=worst_joint,
            updated_at=now,
        )

    # Welford 滚动均值/方差
    n0 = row.attempts
    mean0 = row.avg_score
    # 用 M2 反推：variance = M2/n → M2 = variance*n
    m2_0 = row.score_variance * n0 if n0 > 0 else 0.0

    n1 = n0 + 1
    delta = score - mean0
    mean1 = mean0 + delta / n1
    m2_1 = m2_0 + delta * (score - mean1)
    var1 = m2_1 / n1 if n1 > 0 else 0.0

    row.attempts = n1
    row.avg_score = round(mean1, 3)
    row.score_variance = round(var1, 3)
    row.measured_difficulty = _difficulty_from(mean1, var1)
    if worst_joint:
        row.top_worst_joint = worst_joint
    row.updated_at = now
    s.add(row)


def get_difficulty_aggregates(
    *, lesson_id: str, scope: str = "global"
) -> list[dict[str, Any]]:
    """读某课所有 segment 的难度聚合（默认 global scope）。给卡片回写用。"""
    with session_scope() as s:
        stmt = select(SegmentDifficultyAggRow).where(
            SegmentDifficultyAggRow.lesson_id == lesson_id,
            SegmentDifficultyAggRow.scope == scope,
        )
        rows = s.exec(stmt).all()
        return [
            {
                "segmentId": r.segment_id,
                "attempts": r.attempts,
                "avgScore": r.avg_score,
                "scoreVariance": r.score_variance,
                "measuredDifficulty": r.measured_difficulty,
                "topWorstJoint": r.top_worst_joint,
                "updatedAt": r.updated_at,
            }
            for r in rows
        ]


def list_sessions(*, lesson_id: str, user_id: str) -> list[dict[str, Any]]:
    with session_scope() as s:
        stmt = (
            select(TrackingSessionRow)
            .where(
                TrackingSessionRow.lesson_id == lesson_id,
                TrackingSessionRow.user_id == user_id,
            )
        )
        rows = s.exec(stmt).all()
        rows_sorted = sorted(rows, key=lambda r: r.created_at, reverse=True)
        return [
            {
                "sessionId": r.id,
                "overallScore": r.overall_score,
                "frameCount": r.frame_count,
                "poseSource": r.pose_source,
                "createdAt": r.created_at,
            }
            for r in rows_sorted
        ]
