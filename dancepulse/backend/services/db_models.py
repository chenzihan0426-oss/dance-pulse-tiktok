"""SQLModel 表定义。

列名采用 snake_case，与 migrations/20260419_phase5_phase6_schema.sql 对齐，
将来切到 PostgreSQL 时 schema 保持一致。

时间戳沿用现有实现的 ISO8601 字符串（而非原生 TIMESTAMP），以与旧 JSON 数据
和各处基于字符串的排序/比较保持行为等价。

复杂/嵌套结构（segment_scores、snapshot data）使用 JSON 列存储。

每个 Row 通过 to_api_dict()/to_model() 转换回前端使用的 camelCase 结构，
使上层 store 的业务逻辑无需改动。
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from models import TrackingResult, TrackingSegmentScore


class UserRow(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(primary_key=True)
    phone: str = Field(index=True, unique=True)
    username: str = Field(index=True, unique=True)
    display_name: str = ""
    avatar: Optional[str] = None
    bio: Optional[str] = None
    is_verified: bool = False
    created_at: str = ""

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "phone": self.phone,
            "username": self.username,
            "displayName": self.display_name,
            "avatar": self.avatar,
            "bio": self.bio,
            "isVerified": self.is_verified,
            "createdAt": self.created_at,
        }

    @classmethod
    def from_api_dict(cls, raw: dict[str, Any]) -> "UserRow":
        return cls(
            id=raw["id"],
            phone=raw.get("phone", ""),
            username=raw["username"],
            display_name=raw.get("displayName", ""),
            avatar=raw.get("avatar"),
            bio=raw.get("bio"),
            is_verified=bool(raw.get("isVerified", False)),
            created_at=raw.get("createdAt", ""),
        )


class SessionRow(SQLModel, table=True):
    __tablename__ = "sessions"

    token: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    created_at: str = ""

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "token": self.token,
            "userId": self.user_id,
            "createdAt": self.created_at,
        }

    @classmethod
    def from_api_dict(cls, raw: dict[str, Any]) -> "SessionRow":
        return cls(
            token=raw["token"],
            user_id=raw.get("userId", ""),
            created_at=raw.get("createdAt", ""),
        )


class SmsCodeRow(SQLModel, table=True):
    __tablename__ = "sms_codes"

    phone: str = Field(primary_key=True)
    code: str = ""
    expires_at: str = ""

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "phone": self.phone,
            "code": self.code,
            "expiresAt": self.expires_at,
        }

    @classmethod
    def from_api_dict(cls, raw: dict[str, Any]) -> "SmsCodeRow":
        return cls(
            phone=raw["phone"],
            code=str(raw.get("code", "")),
            expires_at=raw.get("expiresAt", ""),
        )


class SnapshotRow(SQLModel, table=True):
    __tablename__ = "snapshots"

    user_id: str = Field(primary_key=True)
    data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class TrackingResultRow(SQLModel, table=True):
    __tablename__ = "tracking_results"

    id: str = Field(primary_key=True)
    lesson_id: str = Field(index=True)
    user_id: str = Field(index=True)
    created_at: str = ""
    score: int = 0
    segment_scores: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    video_url: str = ""
    is_public: bool = False
    published_at: Optional[str] = None
    like_count: int = 0
    comment_count: int = 0
    moderation_status: str = "none"
    moderation_reason: Optional[str] = None

    def to_model(self) -> TrackingResult:
        return TrackingResult(
            id=self.id,
            lessonId=self.lesson_id,
            userId=self.user_id,
            createdAt=self.created_at,
            score=self.score,
            segmentScores=[
                TrackingSegmentScore.model_validate(s) for s in (self.segment_scores or [])
            ],
            videoUrl=self.video_url,
            isPublic=self.is_public,
            publishedAt=self.published_at,
            likeCount=self.like_count,
            commentCount=self.comment_count,
            moderationStatus=self.moderation_status,  # type: ignore[arg-type]
            moderationReason=self.moderation_reason,
        )

    @classmethod
    def from_model(cls, m: TrackingResult) -> "TrackingResultRow":
        return cls(
            id=m.id,
            lesson_id=m.lessonId,
            user_id=m.userId,
            created_at=m.createdAt,
            score=m.score,
            segment_scores=[s.model_dump(mode="json") for s in m.segmentScores],
            video_url=m.videoUrl,
            is_public=m.isPublic,
            published_at=m.publishedAt,
            like_count=m.likeCount,
            comment_count=m.commentCount,
            moderation_status=m.moderationStatus,
            moderation_reason=m.moderationReason,
        )


class FollowRow(SQLModel, table=True):
    __tablename__ = "follows"

    follower_id: str = Field(primary_key=True)
    followee_id: str = Field(primary_key=True)
    created_at: str = ""

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "followerId": self.follower_id,
            "followeeId": self.followee_id,
            "createdAt": self.created_at,
        }

    @classmethod
    def from_api_dict(cls, raw: dict[str, Any]) -> "FollowRow":
        return cls(
            follower_id=raw["followerId"],
            followee_id=raw["followeeId"],
            created_at=raw.get("createdAt", ""),
        )


class LikeRow(SQLModel, table=True):
    __tablename__ = "likes"

    user_id: str = Field(primary_key=True)
    tracking_result_id: str = Field(primary_key=True)
    created_at: str = ""

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "userId": self.user_id,
            "trackingResultId": self.tracking_result_id,
            "createdAt": self.created_at,
        }

    @classmethod
    def from_api_dict(cls, raw: dict[str, Any]) -> "LikeRow":
        return cls(
            user_id=raw["userId"],
            tracking_result_id=raw["trackingResultId"],
            created_at=raw.get("createdAt", ""),
        )


class CommentRow(SQLModel, table=True):
    __tablename__ = "comments"

    id: str = Field(primary_key=True)
    tracking_result_id: str = Field(index=True)
    user_id: str = ""
    # username/display_name/avatar 为展示用反范式化字段，与原 JSON 实现保持一致。
    # （范式化为按需 join users 表可作为后续优化。）
    username: str = ""
    display_name: str = ""
    avatar: Optional[str] = None
    content: str = ""
    created_at: str = ""
    moderation_status: str = "none"

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "trackingResultId": self.tracking_result_id,
            "userId": self.user_id,
            "username": self.username,
            "displayName": self.display_name,
            "avatar": self.avatar,
            "content": self.content,
            "createdAt": self.created_at,
        }

    @classmethod
    def from_api_dict(cls, raw: dict[str, Any]) -> "CommentRow":
        return cls(
            id=raw["id"],
            tracking_result_id=raw["trackingResultId"],
            user_id=raw["userId"],
            username=raw.get("username", ""),
            display_name=raw.get("displayName", ""),
            avatar=raw.get("avatar"),
            content=raw.get("content", ""),
            created_at=raw.get("createdAt", ""),
            moderation_status=raw.get("moderationStatus", "none"),
        )
