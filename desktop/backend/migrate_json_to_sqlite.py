"""一次性迁移脚本：把 data/ 下旧的 JSON 持久化数据导入 SQLite。

用法（在 backend 目录下运行）：
    python migrate_json_to_sqlite.py

特性：
- 幂等：按主键 upsert，可安全重复运行。
- 非破坏：迁移后旧 JSON 文件保留不动，确认无误后可自行删除或留作备份。
"""

from __future__ import annotations

import json
from pathlib import Path

from models import TrackingResult
from services.db import init_db, session_scope
from services.db_models import (
    CommentRow,
    FollowRow,
    LikeRow,
    SessionRow,
    SmsCodeRow,
    SnapshotRow,
    TrackingResultRow,
    UserRow,
)


DATA_DIR = Path(__file__).resolve().parent / "data"


def _read(path: Path, fallback):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def migrate() -> dict[str, int]:
    init_db()
    counts: dict[str, int] = {}

    auth = DATA_DIR / "auth"
    social = DATA_DIR / "social"
    tracking = DATA_DIR / "tracking"

    with session_scope() as s:
        users = _read(auth / "users.json", {})
        for raw in users.values():
            s.merge(UserRow.from_api_dict(raw))
        counts["users"] = len(users)

        sessions = _read(auth / "sessions.json", {})
        for raw in sessions.values():
            s.merge(SessionRow.from_api_dict(raw))
        counts["sessions"] = len(sessions)

        codes = _read(auth / "codes.json", {})
        for raw in codes.values():
            s.merge(SmsCodeRow.from_api_dict(raw))
        counts["sms_codes"] = len(codes)

        snapshots = _read(auth / "snapshots.json", {})
        for user_id, data in snapshots.items():
            s.merge(SnapshotRow(user_id=user_id, data=data))
        counts["snapshots"] = len(snapshots)

        results = _read(tracking / "results.json", [])
        for item in results:
            s.merge(TrackingResultRow.from_model(TrackingResult.model_validate(item)))
        counts["tracking_results"] = len(results)

        follows = _read(social / "follows.json", [])
        for raw in follows:
            s.merge(FollowRow.from_api_dict(raw))
        counts["follows"] = len(follows)

        likes = _read(social / "likes.json", [])
        for raw in likes:
            s.merge(LikeRow.from_api_dict(raw))
        counts["likes"] = len(likes)

        comments = _read(social / "comments.json", [])
        for raw in comments:
            s.merge(CommentRow.from_api_dict(raw))
        counts["comments"] = len(comments)

    return counts


if __name__ == "__main__":
    result = migrate()
    print("迁移完成，导入记录数：")
    for table, n in result.items():
        print(f"  {table}: {n}")
