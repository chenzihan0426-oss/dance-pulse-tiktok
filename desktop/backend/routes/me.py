from __future__ import annotations

from fastapi import APIRouter, Header

from models import BadgesResponse, MeResponse, MigrateLocalSnapshotRequest, MigrateLocalSnapshotResponse
from services.auth_store import (
    build_badges_response,
    build_me_response,
    get_user_by_token,
    merge_local_snapshot,
    parse_auth_token,
)


router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("", response_model=MeResponse)
def get_me(authorization: str | None = Header(default=None)) -> MeResponse:
    token = parse_auth_token(authorization)
    return build_me_response(token)


@router.get("/badges", response_model=BadgesResponse)
def get_my_badges(authorization: str | None = Header(default=None)) -> BadgesResponse:
    token = parse_auth_token(authorization)
    return build_badges_response(token)


@router.post("/migrate-local", response_model=MigrateLocalSnapshotResponse)
def migrate_local(
    payload: MigrateLocalSnapshotRequest,
    authorization: str | None = Header(default=None),
) -> MigrateLocalSnapshotResponse:
    token = parse_auth_token(authorization)
    user = get_user_by_token(token)
    merged = merge_local_snapshot(user.id, payload.snapshot)
    return MigrateLocalSnapshotResponse(ok=True, snapshot=merged)
