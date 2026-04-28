from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from models import (
    CommunityFeedResponse,
    CommunityTrackingDetailResponse,
    CommunityUserProfileResponse,
    TrackingResult,
    ToggleFollowResponse,
    ToggleLikeResponse,
)
from services.auth_store import get_user_by_token, parse_auth_token
from services.social_store import (
    GUEST_USER_ID,
    add_comment,
    build_feed_item,
    build_feed_items,
    build_public_user_profile,
    find_user_id_by_username,
    list_comments,
    remove_tracking_result,
    publish_tracking_result,
    unpublish_tracking_result,
    toggle_follow,
    toggle_like,
)
from services.tracking_store import get_tracking_result


router = APIRouter(prefix="/api/community", tags=["community"])


class CreateCommentRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=200)


@router.get("/feed", response_model=CommunityFeedResponse)
def get_community_feed(authorization: str | None = Header(default=None)) -> CommunityFeedResponse:
    viewer_id = _resolve_actor_id(authorization)
    return CommunityFeedResponse(items=build_feed_items(viewer_id=viewer_id))


@router.get("/tracking-results/{result_id}", response_model=CommunityTrackingDetailResponse)
def get_community_tracking_detail(
    result_id: str,
    authorization: str | None = Header(default=None),
) -> CommunityTrackingDetailResponse:
    viewer_id = _resolve_actor_id(authorization)
    result = _safe_get_tracking_result(result_id)
    if not result.isPublic:
        raise HTTPException(status_code=404, detail="Tracking result not found")
    return CommunityTrackingDetailResponse(
        item=build_feed_item(result, viewer_id=viewer_id),
        comments=list_comments(result_id),
    )


@router.post("/tracking-results/{result_id}/publish", response_model=TrackingResult)
def publish_tracking(
    result_id: str,
    authorization: str | None = Header(default=None),
) -> TrackingResult:
    actor_id = _resolve_actor_id(authorization)
    try:
        return publish_tracking_result(result_id, actor_id=actor_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Tracking result not found")


@router.post("/tracking-results/{result_id}/unpublish", response_model=TrackingResult)
def unpublish_tracking(
    result_id: str,
    authorization: str | None = Header(default=None),
) -> TrackingResult:
    actor_id = _resolve_actor_id(authorization)
    try:
        return unpublish_tracking_result(result_id, actor_id=actor_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Tracking result not found")


@router.delete("/tracking-results/{result_id}")
def delete_tracking(
    result_id: str,
    authorization: str | None = Header(default=None),
):
    actor_id = _resolve_actor_id(authorization)
    try:
        remove_tracking_result(result_id, actor_id=actor_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Tracking result not found")
    return {"ok": True}


@router.post("/tracking-results/{result_id}/like", response_model=ToggleLikeResponse)
def like_tracking_result(
    result_id: str,
    authorization: str | None = Header(default=None),
) -> ToggleLikeResponse:
    _safe_get_tracking_result(result_id)
    actor_id = _resolve_actor_id(authorization)
    return toggle_like(result_id, actor_id=actor_id)


@router.get("/tracking-results/{result_id}/comments")
def get_comments(result_id: str):
    _safe_get_tracking_result(result_id)
    return {"comments": list_comments(result_id)}


@router.post("/tracking-results/{result_id}/comments")
def create_comment(
    result_id: str,
    payload: CreateCommentRequest,
    authorization: str | None = Header(default=None),
):
    _safe_get_tracking_result(result_id)
    actor_id = _resolve_actor_id(authorization)
    comment = add_comment(result_id, actor_id=actor_id, content=payload.content)
    return {"comment": comment, "comments": list_comments(result_id)}


@router.get("/users/{username}", response_model=CommunityUserProfileResponse)
def get_public_profile(
    username: str,
    authorization: str | None = Header(default=None),
) -> CommunityUserProfileResponse:
    viewer_id = _resolve_actor_id(authorization)
    user_id = find_user_id_by_username(username)
    return CommunityUserProfileResponse(
        user=build_public_user_profile(user_id, viewer_id=viewer_id),
        results=build_feed_items(viewer_id=viewer_id, username=username),
    )


@router.post("/users/{username}/follow", response_model=ToggleFollowResponse)
def follow_user(
    username: str,
    authorization: str | None = Header(default=None),
) -> ToggleFollowResponse:
    actor_id = _resolve_actor_id(authorization)
    return toggle_follow(username, actor_id=actor_id)


def _resolve_actor_id(authorization: str | None) -> str:
    if not authorization:
        return GUEST_USER_ID
    token = parse_auth_token(authorization)
    return get_user_by_token(token).id


def _safe_get_tracking_result(result_id: str):
    try:
        return get_tracking_result(result_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Tracking result not found")
