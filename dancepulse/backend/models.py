from __future__ import annotations

from enum import Enum
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator

from services.teaching_cues import normalize_beat_cues


class TeachingStatus(str, Enum):
    READY = "ready"
    PENDING = "pending"
    FAILED = "failed"


class TeachingStep(BaseModel):
    beats: str
    content: str


class Teaching(BaseModel):
    status: TeachingStatus = TeachingStatus.PENDING
    summary: str = ""
    steps: list[TeachingStep] = Field(default_factory=list)
    tips: list[str] = Field(default_factory=list)
    beat_cues: list[str | None] = Field(default_factory=list)
    generated_at: str = ""


class Section(BaseModel):
    id: str
    label: str
    start: float
    end: float


class Segment(BaseModel):
    id: str
    lesson_id: str
    index: int
    section: str
    section_label: str
    start: float
    end: float
    duration: float
    beat_count: int
    thumbnail: str
    clip_url: str
    pose_url: str = ""
    matte_rgb_url: str = ""   # RVM 产出的前景 RGB 视频
    matte_mask_url: str = ""  # RVM 产出的 alpha mask 视频(灰度编码)
    pose_full_url: str = ""   # pose_landmarker_full.task 抽的 33 点全帧(轩哥方案)
    particle_url: str = ""    # 粒子引导视频(Stepin 风格)
    difficulty: int = Field(ge=1, le=5)
    is_still: bool
    ai_description: str
    user_edited: bool = False
    teaching: Teaching = Field(default_factory=Teaching)
    deleted: bool = False

    @model_validator(mode="after")
    def _sync_teaching_beat_cues(self):
        normalized_cues = normalize_beat_cues(
            self.teaching.beat_cues,
            self.beat_count,
        )
        if normalized_cues != self.teaching.beat_cues:
            self.teaching = self.teaching.model_copy(update={"beat_cues": normalized_cues})
        return self


class Lesson(BaseModel):
    id: str
    title: str
    source_url: str = ""
    duration: float
    bpm: float
    video_url: str
    thumbnail: str
    confirmed: bool = False
    beat_quality: Literal["high", "low"] = "high"
    beats: list[float] = Field(default_factory=list)
    sections: list[Section] = Field(default_factory=list)
    segments: list[Segment] = Field(default_factory=list)


class LessonListItem(BaseModel):
    id: str
    title: str
    thumbnail: str
    duration: float
    bpm: float
    confirmed: bool
    demo_ready: bool = False
    has_video: bool = True


class UpdateOp(BaseModel):
    op: Literal["update"]
    id: str
    start: float
    end: float


class MergeOp(BaseModel):
    op: Literal["merge"]
    ids: list[str]


class SplitOp(BaseModel):
    op: Literal["split"]
    id: str
    at: float


class DeleteOp(BaseModel):
    op: Literal["delete"]
    id: str


class CreateOp(BaseModel):
    op: Literal["create"]
    start: float
    end: float
    section: str


PatchOp = Union[UpdateOp, MergeOp, SplitOp, DeleteOp, CreateOp]


class PatchSegmentsRequest(BaseModel):
    ops: list[PatchOp]


class RegenerateLessonRequest(BaseModel):
    granularity: Literal[4, 8, 16] = 8
    still_handling: Literal["mark", "merge", "delete"] = "mark"
    section_detection: bool = True


class ConfirmLessonResponse(BaseModel):
    ok: bool
    lesson: Lesson


class ImportRequest(BaseModel):
    url: str = Field(..., min_length=3, description="抖音分享页链接")


class ImportResponse(BaseModel):
    job_id: str
    status: str
    message: Optional[str] = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    lesson_id: Optional[str] = None
    error: Optional[str] = None
    fallback_hint: str
    progress: int = 0
    phase: str = "download"


class TeachingRegenerateResponse(BaseModel):
    ok: bool
    status: str


class SegmentContextResponse(BaseModel):
    lesson: Lesson
    segment: Segment


class User(BaseModel):
    id: str
    phone: str
    username: str
    displayName: str
    avatar: str | None = None
    bio: str | None = None
    isVerified: bool = False
    createdAt: str


class UserStats(BaseModel):
    userId: str
    followerCount: int = 0
    followingCount: int = 0
    publishedTrackingCount: int = 0
    totalLikesReceived: int = 0


class MeStreak(BaseModel):
    currentDays: int = 0
    thisWeek: list[bool] = Field(default_factory=lambda: [False] * 7)


class MeStats(BaseModel):
    learnedSegments: int = 0
    totalStudyMinutes: int = 0
    badgesCount: int = 0
    lessonsCount: int = 0


class MeResponse(BaseModel):
    user: User
    streak: MeStreak
    stats: MeStats
    badges: list[str] = Field(default_factory=list)


class BadgesResponse(BaseModel):
    badges: list[str] = Field(default_factory=list)


class SendSmsRequest(BaseModel):
    phone: str = Field(..., min_length=6)


class SendSmsResponse(BaseModel):
    ok: bool = True
    devCode: str | None = None
    expiresIn: int = 300


class VerifySmsRequest(BaseModel):
    phone: str = Field(..., min_length=6)
    code: str = Field(..., min_length=4)


class VerifySmsResponse(BaseModel):
    ok: bool = True
    token: str
    user: User


class UserLessonState(BaseModel):
    lessonId: str
    enrolled: bool = True
    favorited: bool = False
    lastStudiedAt: str | None = None


class TrackingSegmentScore(BaseModel):
    segmentId: str
    score: int = Field(ge=0, le=100)
    timingMs: int = Field(ge=0)


class TrackingResult(BaseModel):
    id: str
    lessonId: str
    userId: str
    createdAt: str
    score: int = Field(ge=0, le=100)
    segmentScores: list[TrackingSegmentScore] = Field(default_factory=list)
    videoUrl: str
    isPublic: bool = False
    publishedAt: str | None = None
    likeCount: int = 0
    commentCount: int = 0
    moderationStatus: Literal["none", "pending", "approved", "rejected"] = "none"
    moderationReason: str | None = None


class TrackingResultsResponse(BaseModel):
    results: list[TrackingResult] = Field(default_factory=list)


class PublicUserProfile(BaseModel):
    id: str
    username: str
    displayName: str
    avatar: str | None = None
    bio: str | None = None
    isVerified: bool = False
    createdAt: str
    stats: UserStats
    isFollowing: bool = False


class CommunityComment(BaseModel):
    id: str
    trackingResultId: str
    userId: str
    username: str
    displayName: str
    avatar: str | None = None
    content: str
    createdAt: str


class CommunityFeedItem(BaseModel):
    result: TrackingResult
    user: PublicUserProfile
    lessonTitle: str
    previewThumbnail: str | None = None
    likedByMe: bool = False


class CommunityFeedResponse(BaseModel):
    items: list[CommunityFeedItem] = Field(default_factory=list)


class CommunityTrackingDetailResponse(BaseModel):
    item: CommunityFeedItem
    comments: list[CommunityComment] = Field(default_factory=list)


class CommunityUserProfileResponse(BaseModel):
    user: PublicUserProfile
    results: list[CommunityFeedItem] = Field(default_factory=list)


class ToggleLikeResponse(BaseModel):
    liked: bool
    likeCount: int


class ToggleFollowResponse(BaseModel):
    following: bool
    followerCount: int


class ActivitySnapshot(BaseModel):
    lastActiveDate: str | None = None
    currentStreak: int = 0


class LocalProgressSnapshot(BaseModel):
    learnedByLesson: dict[str, list[str]] = Field(default_factory=dict)
    badges: list[str] = Field(default_factory=list)
    activity: ActivitySnapshot = Field(default_factory=ActivitySnapshot)
    userLessonStates: dict[str, UserLessonState] = Field(default_factory=dict)
    lastViewedSegmentIds: dict[str, str | None] = Field(default_factory=dict)


class MigrateLocalSnapshotRequest(BaseModel):
    snapshot: LocalProgressSnapshot


class MigrateLocalSnapshotResponse(BaseModel):
    ok: bool = True
    snapshot: LocalProgressSnapshot
