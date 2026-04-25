from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import services.social_store as social_store  # noqa: E402
import services.tracking_store as tracking_store  # noqa: E402
from models import TrackingResult, TrackingSegmentScore  # noqa: E402


def test_publish_like_comment_follow_flow(tmp_path, monkeypatch) -> None:
    tracking_dir = tmp_path / "tracking"
    social_dir = tmp_path / "social"
    auth_dir = tmp_path / "auth"
    users_file = auth_dir / "users.json"

    auth_dir.mkdir(parents=True, exist_ok=True)
    users_file.write_text(
        json.dumps(
            {
                "usr_a": {
                    "id": "usr_a",
                    "phone": "13800138000",
                    "username": "alice",
                    "displayName": "Alice",
                    "avatar": None,
                    "bio": "Hi",
                    "isVerified": False,
                    "createdAt": "2026-04-19T00:00:00+00:00",
                },
                "usr_b": {
                    "id": "usr_b",
                    "phone": "13800138001",
                    "username": "bob",
                    "displayName": "Bob",
                    "avatar": None,
                    "bio": None,
                    "isVerified": False,
                    "createdAt": "2026-04-19T00:00:00+00:00",
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(tracking_store, "TRACKING_DIR", tracking_dir)
    monkeypatch.setattr(tracking_store, "TRACKING_RESULTS_FILE", tracking_dir / "results.json")
    monkeypatch.setattr(tracking_store, "TRACKING_VIDEOS_DIR", tracking_dir / "videos")

    monkeypatch.setattr(social_store, "SOCIAL_DIR", social_dir)
    monkeypatch.setattr(social_store, "AUTH_USERS_FILE", users_file)
    monkeypatch.setattr(social_store, "FOLLOWS_FILE", social_dir / "follows.json")
    monkeypatch.setattr(social_store, "LIKES_FILE", social_dir / "likes.json")
    monkeypatch.setattr(social_store, "COMMENTS_FILE", social_dir / "comments.json")

    tracking_store.ensure_tracking_dirs()
    social_store.ensure_social_dir()

    result = TrackingResult(
        id="trk_test",
        lessonId="les_18ec2100c5f7",
        userId="usr_a",
        createdAt="2026-04-19T00:00:00+00:00",
        score=88,
        segmentScores=[TrackingSegmentScore(segmentId="seg_000", score=88, timingMs=120)],
        videoUrl="/tracking-videos/trk_test.mp4",
        isPublic=False,
        publishedAt=None,
        likeCount=0,
        commentCount=0,
        moderationStatus="none",
        moderationReason=None,
    )
    tracking_store.save_tracking_result(result)

    published = social_store.publish_tracking_result("trk_test", actor_id="usr_a")
    assert published.isPublic is True

    feed = social_store.build_feed_items(viewer_id="usr_b")
    assert len(feed) == 1
    assert feed[0].user.username == "alice"

    like = social_store.toggle_like("trk_test", actor_id="usr_b")
    assert like.liked is True
    assert like.likeCount == 1

    comment = social_store.add_comment("trk_test", actor_id="usr_b", content="跳得很好")
    assert comment.username == "bob"
    comments = social_store.list_comments("trk_test")
    assert len(comments) == 1

    follow = social_store.toggle_follow("alice", actor_id="usr_b")
    assert follow.following is True
    assert follow.followerCount == 1

    profile = social_store.build_public_user_profile("usr_a", viewer_id="usr_b")
    assert profile.isFollowing is True
    assert profile.stats.totalLikesReceived == 1

    unpublished = social_store.unpublish_tracking_result("trk_test", actor_id="usr_a")
    assert unpublished.isPublic is False
    assert social_store.build_feed_items(viewer_id="usr_b") == []

    social_store.publish_tracking_result("trk_test", actor_id="usr_a")
    social_store.remove_tracking_result("trk_test", actor_id="usr_a")
    assert social_store.build_feed_items(viewer_id="usr_b") == []
