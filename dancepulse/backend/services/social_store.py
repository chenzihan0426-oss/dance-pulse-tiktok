from __future__ import annotations

import json
import secrets
from pathlib import Path

from fastapi import HTTPException

from models import (
    CommunityComment,
    CommunityFeedItem,
    PublicUserProfile,
    ToggleFollowResponse,
    ToggleLikeResponse,
    TrackingResult,
    UserStats,
)
from services.lesson_store import load_lesson
from services.tracking_store import (
    delete_tracking_result,
    get_tracking_result,
    list_tracking_results,
    now_iso,
    update_tracking_result,
)


BASE_DIR = Path(__file__).resolve().parent.parent
SOCIAL_DIR = BASE_DIR / "data" / "social"
AUTH_USERS_FILE = BASE_DIR / "data" / "auth" / "users.json"
FOLLOWS_FILE = SOCIAL_DIR / "follows.json"
LIKES_FILE = SOCIAL_DIR / "likes.json"
COMMENTS_FILE = SOCIAL_DIR / "comments.json"
GUEST_USER_ID = "guest_local"
GUEST_USERNAME = "local_guest"


def ensure_social_dir() -> None:
    SOCIAL_DIR.mkdir(parents=True, exist_ok=True)


def _read_json(path: Path, fallback):
    ensure_social_dir()
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def _write_json(path: Path, payload) -> None:
    ensure_social_dir()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_users() -> dict[str, dict]:
    if not AUTH_USERS_FILE.exists():
        return {}
    try:
        return json.loads(AUTH_USERS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _load_follows() -> list[dict]:
    return _read_json(FOLLOWS_FILE, [])


def _save_follows(records: list[dict]) -> None:
    _write_json(FOLLOWS_FILE, records)


def _load_likes() -> list[dict]:
    return _read_json(LIKES_FILE, [])


def _save_likes(records: list[dict]) -> None:
    _write_json(LIKES_FILE, records)


def _load_comments() -> list[dict]:
    return _read_json(COMMENTS_FILE, [])


def _save_comments(records: list[dict]) -> None:
    _write_json(COMMENTS_FILE, records)


def build_feed_items(*, viewer_id: str | None = None, username: str | None = None) -> list[CommunityFeedItem]:
    results = [
        result
        for result in list_tracking_results()
        if result.isPublic and (username is None or build_public_user_profile(result.userId, viewer_id=viewer_id).username == username)
    ]
    return [build_feed_item(result, viewer_id=viewer_id) for result in results]


def build_feed_item(result: TrackingResult, *, viewer_id: str | None = None) -> CommunityFeedItem:
    user = build_public_user_profile(result.userId, viewer_id=viewer_id)
    lesson = load_lesson(result.lessonId)
    liked_by_me = any(
        record["userId"] == (viewer_id or GUEST_USER_ID) and record["trackingResultId"] == result.id
        for record in _load_likes()
    )
    return CommunityFeedItem(
        result=result,
        user=user,
        lessonTitle=lesson.title,
        previewThumbnail=lesson.thumbnail,
        likedByMe=liked_by_me,
    )


def build_public_user_profile(user_id: str, *, viewer_id: str | None = None) -> PublicUserProfile:
    users = _load_users()
    raw_user = users.get(user_id)
    if raw_user is None and user_id == GUEST_USER_ID:
        raw_user = {
            "id": GUEST_USER_ID,
            "phone": "",
            "username": GUEST_USERNAME,
            "displayName": "本机访客",
            "avatar": None,
            "bio": "未登录发布的本机作品",
            "isVerified": False,
            "createdAt": now_iso(),
        }
    if raw_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    stats = build_user_stats(raw_user["id"])
    follows = _load_follows()
    is_following = any(
        record["followerId"] == (viewer_id or GUEST_USER_ID) and record["followeeId"] == raw_user["id"]
        for record in follows
    )
    return PublicUserProfile(
        id=raw_user["id"],
        username=raw_user["username"],
        displayName=raw_user["displayName"],
        avatar=raw_user.get("avatar"),
        bio=raw_user.get("bio"),
        isVerified=bool(raw_user.get("isVerified")),
        createdAt=raw_user["createdAt"],
        stats=stats,
        isFollowing=is_following and raw_user["id"] != (viewer_id or GUEST_USER_ID),
    )


def build_user_stats(user_id: str) -> UserStats:
    public_results = [item for item in list_tracking_results(user_id=user_id) if item.isPublic]
    likes = _load_likes()
    follows = _load_follows()
    result_ids = {item.id for item in public_results}
    total_likes = sum(1 for like in likes if like["trackingResultId"] in result_ids)
    return UserStats(
        userId=user_id,
        followerCount=sum(1 for record in follows if record["followeeId"] == user_id),
        followingCount=sum(1 for record in follows if record["followerId"] == user_id),
        publishedTrackingCount=len(public_results),
        totalLikesReceived=total_likes,
    )


def find_user_id_by_username(username: str) -> str:
    if username == GUEST_USERNAME:
        return GUEST_USER_ID
    for user_id, raw in _load_users().items():
        if raw.get("username") == username:
            return user_id
    raise HTTPException(status_code=404, detail="User not found")


def publish_tracking_result(result_id: str, *, actor_id: str) -> TrackingResult:
    result = get_tracking_result(result_id)
    if result.userId not in {actor_id, GUEST_USER_ID}:
        raise HTTPException(status_code=403, detail="Cannot publish another user's result")

    next_user_id = actor_id if actor_id != GUEST_USER_ID else result.userId
    published_at = result.publishedAt or now_iso()
    updated = result.model_copy(
        update={
            "userId": next_user_id,
            "isPublic": True,
            "publishedAt": published_at,
        }
    )
    return update_tracking_result(updated)


def unpublish_tracking_result(result_id: str, *, actor_id: str) -> TrackingResult:
    result = get_tracking_result(result_id)
    if result.userId not in {actor_id, GUEST_USER_ID}:
        raise HTTPException(status_code=403, detail="Cannot unpublish another user's result")

    updated = result.model_copy(
        update={
            "isPublic": False,
            "publishedAt": None,
        }
    )
    return update_tracking_result(updated)


def remove_tracking_result(result_id: str, *, actor_id: str) -> None:
    result = get_tracking_result(result_id)
    if result.userId not in {actor_id, GUEST_USER_ID}:
        raise HTTPException(status_code=403, detail="Cannot delete another user's result")

    likes = [item for item in _load_likes() if item["trackingResultId"] != result_id]
    comments = [item for item in _load_comments() if item["trackingResultId"] != result_id]
    _save_likes(likes)
    _save_comments(comments)
    delete_tracking_result(result_id)


def toggle_like(result_id: str, *, actor_id: str) -> ToggleLikeResponse:
    likes = _load_likes()
    existing = next(
        (
            item
            for item in likes
            if item["userId"] == actor_id and item["trackingResultId"] == result_id
        ),
        None,
    )
    if existing:
        likes = [item for item in likes if item is not existing]
        liked = False
    else:
        likes.append(
            {
                "id": f"like_{secrets.token_hex(6)}",
                "userId": actor_id,
                "trackingResultId": result_id,
                "createdAt": now_iso(),
            }
        )
        liked = True
    _save_likes(likes)

    result = get_tracking_result(result_id)
    like_count = sum(1 for item in likes if item["trackingResultId"] == result_id)
    update_tracking_result(result.model_copy(update={"likeCount": like_count}))
    return ToggleLikeResponse(liked=liked, likeCount=like_count)


def toggle_follow(username: str, *, actor_id: str) -> ToggleFollowResponse:
    followee_id = find_user_id_by_username(username)
    if followee_id == actor_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")

    follows = _load_follows()
    existing = next(
        (
            item
            for item in follows
            if item["followerId"] == actor_id and item["followeeId"] == followee_id
        ),
        None,
    )
    if existing:
        follows = [item for item in follows if item is not existing]
        following = False
    else:
        follows.append(
            {
                "id": f"fol_{secrets.token_hex(6)}",
                "followerId": actor_id,
                "followeeId": followee_id,
                "createdAt": now_iso(),
            }
        )
        following = True
    _save_follows(follows)

    follower_count = sum(1 for item in follows if item["followeeId"] == followee_id)
    return ToggleFollowResponse(following=following, followerCount=follower_count)


def list_comments(result_id: str) -> list[CommunityComment]:
    comments = [
        CommunityComment.model_validate(item)
        for item in _load_comments()
        if item["trackingResultId"] == result_id
    ]
    return sorted(comments, key=lambda item: item.createdAt)


def add_comment(result_id: str, *, actor_id: str, content: str) -> CommunityComment:
    text = content.strip()
    if len(text) < 1:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if len(text) > 200:
        raise HTTPException(status_code=400, detail="Comment is too long")

    user = build_public_user_profile(actor_id)
    comment = CommunityComment(
        id=f"cmt_{secrets.token_hex(6)}",
        trackingResultId=result_id,
        userId=actor_id,
        username=user.username,
        displayName=user.displayName,
        avatar=user.avatar,
        content=text,
        createdAt=now_iso(),
    )

    raw_comments = _load_comments()
    raw_comments.append(comment.model_dump(mode="json"))
    _save_comments(raw_comments)

    result = get_tracking_result(result_id)
    comment_count = sum(1 for item in raw_comments if item["trackingResultId"] == result_id)
    update_tracking_result(result.model_copy(update={"commentCount": comment_count}))
    return comment
