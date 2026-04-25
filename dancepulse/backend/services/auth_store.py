from __future__ import annotations

import json
import random
import re
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import HTTPException

from models import (
    ActivitySnapshot,
    BadgesResponse,
    LocalProgressSnapshot,
    MeResponse,
    MeStats,
    MeStreak,
    User,
    UserLessonState,
    UserStats,
)


BASE_DIR = Path(__file__).resolve().parent.parent
AUTH_DIR = BASE_DIR / "data" / "auth"
USERS_FILE = AUTH_DIR / "users.json"
SESSIONS_FILE = AUTH_DIR / "sessions.json"
CODES_FILE = AUTH_DIR / "codes.json"
SNAPSHOTS_FILE = AUTH_DIR / "snapshots.json"


def _ensure_auth_dir() -> None:
    AUTH_DIR.mkdir(parents=True, exist_ok=True)


def _read_json(path: Path, fallback):
    _ensure_auth_dir()
    if not path.exists():
      return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def _write_json(path: Path, payload) -> None:
    _ensure_auth_dir()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _sanitize_phone(phone: str) -> str:
    digits = re.sub(r"\D+", "", phone)
    if len(digits) < 6:
        raise HTTPException(status_code=400, detail="Phone number is invalid")
    return digits


def _load_users() -> dict[str, dict]:
    return _read_json(USERS_FILE, {})


def _save_users(users: dict[str, dict]) -> None:
    _write_json(USERS_FILE, users)


def _load_sessions() -> dict[str, dict]:
    return _read_json(SESSIONS_FILE, {})


def _save_sessions(sessions: dict[str, dict]) -> None:
    _write_json(SESSIONS_FILE, sessions)


def _load_codes() -> dict[str, dict]:
    return _read_json(CODES_FILE, {})


def _save_codes(codes: dict[str, dict]) -> None:
    _write_json(CODES_FILE, codes)


def _load_snapshots() -> dict[str, dict]:
    return _read_json(SNAPSHOTS_FILE, {})


def _save_snapshots(snapshots: dict[str, dict]) -> None:
    _write_json(SNAPSHOTS_FILE, snapshots)


def _generate_username(users: dict[str, dict]) -> str:
    existing = {user.get("username") for user in users.values()}
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    while True:
        suffix = "".join(secrets.choice(alphabet) for _ in range(6))
        username = f"user_{suffix}"
        if username not in existing:
            return username


def _find_user_by_phone(users: dict[str, dict], phone: str) -> dict | None:
    for user in users.values():
        if user.get("phone") == phone:
            return user
    return None


def _normalize_snapshot(raw: dict | None) -> LocalProgressSnapshot:
    return LocalProgressSnapshot.model_validate(raw or {})


def send_sms_code(phone: str) -> tuple[str, int]:
    normalized_phone = _sanitize_phone(phone)
    code = f"{random.randint(0, 999999):06d}"
    expires_at = (datetime.now(UTC) + timedelta(minutes=5)).isoformat()
    codes = _load_codes()
    codes[normalized_phone] = {
        "phone": normalized_phone,
        "code": code,
        "expiresAt": expires_at,
    }
    _save_codes(codes)
    return code, 300


def verify_sms_code(phone: str, code: str) -> tuple[str, User]:
    normalized_phone = _sanitize_phone(phone)
    codes = _load_codes()
    record = codes.get(normalized_phone)
    if not record:
        raise HTTPException(status_code=400, detail="Verification code has expired")

    expires_at = datetime.fromisoformat(record["expiresAt"])
    if datetime.now(UTC) > expires_at:
        codes.pop(normalized_phone, None)
        _save_codes(codes)
        raise HTTPException(status_code=400, detail="Verification code has expired")

    if str(record.get("code")) != str(code).strip():
        raise HTTPException(status_code=400, detail="Verification code is invalid")

    users = _load_users()
    raw_user = _find_user_by_phone(users, normalized_phone)
    if raw_user is None:
        user_id = f"usr_{secrets.token_hex(6)}"
        raw_user = {
            "id": user_id,
            "phone": normalized_phone,
            "username": _generate_username(users),
            "displayName": f"用户_{normalized_phone[-4:]}",
            "avatar": None,
            "bio": None,
            "isVerified": False,
            "createdAt": _now_iso(),
        }
        users[user_id] = raw_user
        _save_users(users)

    token = f"sess_{secrets.token_urlsafe(24)}"
    sessions = _load_sessions()
    sessions[token] = {
        "token": token,
        "userId": raw_user["id"],
        "createdAt": _now_iso(),
    }
    _save_sessions(sessions)

    codes.pop(normalized_phone, None)
    _save_codes(codes)
    return token, User.model_validate(raw_user)


def get_user_by_token(token: str) -> User:
    sessions = _load_sessions()
    session = sessions.get(token)
    if not session:
        raise HTTPException(status_code=401, detail="Unauthorized")

    users = _load_users()
    raw_user = users.get(session["userId"])
    if raw_user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return User.model_validate(raw_user)


def _merge_activity(existing: ActivitySnapshot, incoming: ActivitySnapshot) -> ActivitySnapshot:
    existing_date = existing.lastActiveDate or ""
    incoming_date = incoming.lastActiveDate or ""

    if incoming_date > existing_date:
        return incoming
    if existing_date > incoming_date:
        return existing
    return ActivitySnapshot(
        lastActiveDate=existing.lastActiveDate or incoming.lastActiveDate,
        currentStreak=max(existing.currentStreak, incoming.currentStreak),
    )


def merge_local_snapshot(user_id: str, incoming: LocalProgressSnapshot) -> LocalProgressSnapshot:
    snapshots = _load_snapshots()
    existing = _normalize_snapshot(snapshots.get(user_id))

    learned_by_lesson: dict[str, list[str]] = {}
    for lesson_id in set(existing.learnedByLesson) | set(incoming.learnedByLesson):
        merged = list(
            dict.fromkeys(
                [
                    *existing.learnedByLesson.get(lesson_id, []),
                    *incoming.learnedByLesson.get(lesson_id, []),
                ]
            )
        )
        learned_by_lesson[lesson_id] = merged

    merged_badges = list(dict.fromkeys([*existing.badges, *incoming.badges]))
    merged_activity = _merge_activity(existing.activity, incoming.activity)
    merged_user_lesson_states = {
        **existing.userLessonStates,
        **incoming.userLessonStates,
    }
    merged_last_viewed = {
        **existing.lastViewedSegmentIds,
        **incoming.lastViewedSegmentIds,
    }

    merged_snapshot = LocalProgressSnapshot(
        learnedByLesson=learned_by_lesson,
        badges=merged_badges,
        activity=merged_activity,
        userLessonStates=merged_user_lesson_states,
        lastViewedSegmentIds=merged_last_viewed,
    )

    snapshots[user_id] = merged_snapshot.model_dump(mode="json")
    _save_snapshots(snapshots)
    return merged_snapshot


def get_user_snapshot(user_id: str) -> LocalProgressSnapshot:
    snapshots = _load_snapshots()
    return _normalize_snapshot(snapshots.get(user_id))


def _build_this_week(last_active_date: str | None, current_streak: int) -> list[bool]:
    today = datetime.now(UTC).date()
    result = [False] * 7
    if not last_active_date or current_streak <= 0:
        return result

    try:
        last_active = datetime.fromisoformat(last_active_date).date()
    except ValueError:
        return result

    active_dates = {
        last_active - timedelta(days=offset) for offset in range(max(0, current_streak))
    }
    for index in range(7):
        day = today - timedelta(days=6 - index)
        result[index] = day in active_dates
    return result


def build_me_response(token: str) -> MeResponse:
    user = get_user_by_token(token)
    snapshot = get_user_snapshot(user.id)

    learned_segments = {
        f"{lesson_id}:{segment_id}"
        for lesson_id, segment_ids in snapshot.learnedByLesson.items()
        for segment_id in segment_ids
    }
    learned_count = len(learned_segments)
    lessons_count = sum(1 for state in snapshot.userLessonStates.values() if state.enrolled)
    if lessons_count == 0:
        lessons_count = sum(1 for ids in snapshot.learnedByLesson.values() if ids)

    stats = MeStats(
        learnedSegments=learned_count,
        totalStudyMinutes=learned_count * 2,
        badgesCount=len(snapshot.badges),
        lessonsCount=lessons_count,
    )
    streak = MeStreak(
        currentDays=snapshot.activity.currentStreak,
        thisWeek=_build_this_week(
            snapshot.activity.lastActiveDate,
            snapshot.activity.currentStreak,
        ),
    )

    return MeResponse(
        user=user,
        streak=streak,
        stats=stats,
        badges=snapshot.badges,
    )


def build_badges_response(token: str) -> BadgesResponse:
    user = get_user_by_token(token)
    snapshot = get_user_snapshot(user.id)
    return BadgesResponse(badges=snapshot.badges)


def parse_auth_token(header_value: str | None) -> str:
    if not header_value:
        raise HTTPException(status_code=401, detail="Unauthorized")
    prefix = "Bearer "
    if not header_value.startswith(prefix):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = header_value[len(prefix) :].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return token
