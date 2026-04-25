from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from models import ImportRequest, ImportResponse, JobStatusResponse
from services.import_runner import run_import_job, run_upload_job, save_import_cookies
from services.douyin_fetch import FetchError, normalize_douyin_url
from services.job_store import create_queued_job, find_active_job_by_url, load_job

router = APIRouter(prefix="/api", tags=["import"])


@router.post("/import", response_model=ImportResponse)
async def import_from_url(payload: ImportRequest) -> ImportResponse:
    try:
        normalized_url = normalize_douyin_url(payload.url)
    except FetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing = find_active_job_by_url(normalized_url)
    if existing is not None:
        return ImportResponse(
            job_id=existing.job_id,
            status=existing.status,
            message="相同链接已在导入中，请继续等待当前任务完成",
        )

    job = create_queued_job(url=normalized_url)
    asyncio.create_task(run_import_job(job.job_id, normalized_url))
    return ImportResponse(
        job_id=job.job_id,
        status="queued",
        message="请轮询 GET /api/jobs/{job_id} 直至 status=ready 或 failed",
    )


@router.post("/import/with-cookies", response_model=ImportResponse)
async def import_from_url_with_cookies(
    url: str = Form(...),
    cookies_file: Optional[UploadFile] = File(default=None),
) -> ImportResponse:
    try:
        normalized_url = normalize_douyin_url(url)
    except FetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing = find_active_job_by_url(normalized_url)
    if existing is not None:
        return ImportResponse(
            job_id=existing.job_id,
            status=existing.status,
            message="相同链接已在导入中，请继续等待当前任务完成",
        )

    job = create_queued_job(url=normalized_url)
    cookies_path: str | None = None

    if cookies_file is not None:
        content = await cookies_file.read()
        cookies_path = str(
            save_import_cookies(job.job_id, cookies_file.filename or "cookies.txt", content)
        )

    asyncio.create_task(run_import_job(job.job_id, normalized_url, cookies_path))
    return ImportResponse(
        job_id=job.job_id,
        status="queued",
        message="已接收链接与 cookies 文件，请轮询 GET /api/jobs/{job_id}",
    )


@router.post("/import/upload", response_model=ImportResponse)
async def import_upload(file: UploadFile = File(...)) -> ImportResponse:
    job = create_queued_job(url=None)
    content = await file.read()
    asyncio.create_task(
        run_upload_job(job.job_id, content, file.filename or "upload.mp4"),
    )
    return ImportResponse(
        job_id=job.job_id,
        status="queued",
        message="请轮询 GET /api/jobs/{job_id}；链接失败时可用本地上传",
    )


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str) -> JobStatusResponse:
    record = load_job(job_id)
    return JobStatusResponse(
        job_id=record.job_id,
        status=record.status,
        lesson_id=record.lesson_id,
        error=record.error,
        fallback_hint=record.fallback_hint,
        progress=record.progress,
        phase=record.phase,
    )
